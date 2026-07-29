package com.sp.platform.control.repo;

import com.sp.platform.control.entity.SysUser;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface SysUserRepo extends JpaRepository<SysUser, Long> {

    Optional<SysUser> findByUsername(String username);
}
