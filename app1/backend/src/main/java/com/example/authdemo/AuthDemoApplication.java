package com.example.authdemo;

import com.example.authdemo.config.AuthProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(AuthProperties.class)
public class AuthDemoApplication {
    public static void main(String[] args) {
        SpringApplication.run(AuthDemoApplication.class, args);
    }
}

