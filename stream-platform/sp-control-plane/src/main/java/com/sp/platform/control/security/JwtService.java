package com.sp.platform.control.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;

/** JWT 签发与校验（jjwt）。密钥配置化：sp.jwt.secret（Base64）。 */
@Component
public class JwtService {

    private final SecretKey key;
    private final long ttlMinutes;

    public JwtService(@Value("${sp.jwt.secret}") String base64Secret,
                      @Value("${sp.jwt.ttl-minutes:720}") long ttlMinutes) {
        this.key = Keys.hmacShaKeyFor(Decoders.BASE64.decode(base64Secret));
        this.ttlMinutes = ttlMinutes;
    }

    public String issue(Long uid, String username, String role) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(username)
                .claim("uid", uid)
                .claim("role", role)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(Duration.ofMinutes(ttlMinutes))))
                .signWith(key)
                .compact();
    }

    /** 校验失败抛异常。 */
    public Claims parse(String token) {
        return Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
    }
}
