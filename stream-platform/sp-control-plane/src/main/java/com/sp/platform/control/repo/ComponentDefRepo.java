package com.sp.platform.control.repo;

import com.sp.platform.control.entity.ComponentDefEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ComponentDefRepo extends JpaRepository<ComponentDefEntity, Long> {

    Optional<ComponentDefEntity> findByCode(String code);
}
