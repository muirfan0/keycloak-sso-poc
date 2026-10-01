package com.example.authdemo.config;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;
import java.util.List;

@Validated
@ConfigurationProperties(prefix = "app.auth")
public record AuthProperties(
        boolean ssoEnabled,
        @NotBlank String localIssuer,
        @NotBlank String localSecret,
        Duration tokenTtl,
        @NotBlank String keycloakUrl,
        @NotBlank String keycloakRealm,
        @NotBlank String keycloakClientId,
        @NotBlank String keycloakAudience,
        @NotEmpty List<String> allowedOrigins
) {
    public String keycloakIssuer() {
        return keycloakUrl.replaceAll("/+$", "") + "/realms/" + keycloakRealm;
    }
}
