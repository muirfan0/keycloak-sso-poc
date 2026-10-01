package com.example.authdemo.auth;

import com.example.authdemo.user.AppUser;
import com.example.authdemo.user.AppUserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth")
@ConditionalOnProperty(name = "app.auth.sso-enabled", havingValue = "false", matchIfMissing = true)
public class LocalAuthController {
    private final AuthenticationManager authenticationManager;
    private final LocalTokenService tokens;
    private final AppUserRepository users;
    private final PasswordEncoder passwordEncoder;

    public LocalAuthController(AuthenticationManager authenticationManager, LocalTokenService tokens,
                               AppUserRepository users, PasswordEncoder passwordEncoder) {
        this.authenticationManager = authenticationManager;
        this.tokens = tokens;
        this.users = users;
        this.passwordEncoder = passwordEncoder;
    }

    @PostMapping("/login")
    public LocalTokenService.TokenResponse login(@Valid @RequestBody Credentials request) {
        var authentication = authenticationManager.authenticate(
                UsernamePasswordAuthenticationToken.unauthenticated(request.username(), request.password()));
        return tokens.issue(authentication);
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public LocalTokenService.TokenResponse register(@Valid @RequestBody Credentials request) {
        String username = request.username().trim().toLowerCase();
        if (users.existsByUsernameIgnoreCase(username)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Username is already registered");
        }
        users.save(new AppUser(username, passwordEncoder.encode(request.password()), "USER"));
        var authentication = authenticationManager.authenticate(
                UsernamePasswordAuthenticationToken.unauthenticated(username, request.password()));
        return tokens.issue(authentication);
    }

    public record Credentials(
            @NotBlank
            @Size(min = 3, max = 100)
            @Pattern(regexp = "^[a-zA-Z0-9._@-]+$", message = "contains unsupported characters")
            String username,
            @NotBlank @Size(min = 12, max = 200) String password
    ) {
    }
}

