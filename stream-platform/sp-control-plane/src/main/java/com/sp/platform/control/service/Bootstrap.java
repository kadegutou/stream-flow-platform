package com.sp.platform.control.service;

import com.sp.platform.common.spi.ComponentMeta;
import com.sp.platform.components.ComponentRegistry;
import com.sp.platform.control.entity.ComponentDefEntity;
import com.sp.platform.control.entity.SysUser;
import com.sp.platform.control.repo.ComponentDefRepo;
import com.sp.platform.control.repo.SysUserRepo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** 启动初始化：同步控件元数据到 component_def（按 code upsert）；初始化 admin/admin123。 */
@Component
public class Bootstrap implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(Bootstrap.class);

    private final ComponentDefRepo componentRepo;
    private final SysUserRepo userRepo;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    public Bootstrap(ComponentDefRepo componentRepo, SysUserRepo userRepo) {
        this.componentRepo = componentRepo;
        this.userRepo = userRepo;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        syncComponents();
        initAdmin();
    }

    /** SPI 扫描的内置控件按 code upsert 到 component_def。 */
    private void syncComponents() {
        for (ComponentMeta meta : ComponentRegistry.getInstance().listMeta()) {
            ComponentDefEntity entity = componentRepo.findByCode(meta.code())
                    .orElseGet(ComponentDefEntity::new);
            entity.setCode(meta.code());
            entity.setName(meta.name());
            entity.setCategory(meta.category());
            entity.setDescription(meta.description());
            entity.setIcon(meta.icon());
            entity.setParamSchema(meta.paramSchema());
            entity.setImplClass(meta.implClass());
            entity.setBuiltin(1);
            componentRepo.save(entity);
        }
        log.info("控件注册表同步完成，共 {} 个控件", ComponentRegistry.getInstance().listMeta().size());
    }

    private void initAdmin() {
        if (userRepo.findByUsername("admin").isEmpty()) {
            SysUser admin = new SysUser();
            admin.setUsername("admin");
            admin.setPasswordHash(encoder.encode("admin123"));
            admin.setNickname("管理员");
            admin.setRole("ADMIN");
            userRepo.save(admin);
            log.info("初始化管理员账号 admin/admin123");
        }
    }
}
