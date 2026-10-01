package com.example.authdemo.auth;

import com.example.authdemo.config.AuthProperties;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthConfigController {
    private final AuthProperties properties;

    public AuthConfigController(AuthProperties properties) {
        this.properties = properties;
    }

    @GetMapping("/config")
    public AuthConfig config() {
        if (!properties.ssoEnabled()) {
            return new AuthConfig("local", null, null, null);
        }
        return new AuthConfig("sso", properties.keycloakUrl(), properties.keycloakRealm(),
                properties.keycloakClientId());
    }

    public record AuthConfig(String mode, String keycloakUrl, String realm, String clientId) {
    }
}

