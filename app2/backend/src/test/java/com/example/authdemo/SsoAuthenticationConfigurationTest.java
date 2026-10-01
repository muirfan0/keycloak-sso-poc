package com.example.authdemo;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:sso-test;DB_CLOSE_DELAY=-1",
        "app.auth.sso-enabled=true"
})
@AutoConfigureMockMvc
class SsoAuthenticationConfigurationTest {
    @Autowired
    MockMvc mvc;

    @Test
    void publishesSsoMetadataAndRemovesLocalLogin() throws Exception {
        mvc.perform(get("/api/auth/config"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mode").value("sso"))
                .andExpect(jsonPath("$.keycloakUrl").value("http://localhost:8080"))
                .andExpect(jsonPath("$.realm").value("auth-demo"))
                .andExpect(jsonPath("$.clientId").value("app2-frontend"));

        mvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"ignored\",\"password\":\"ignored-password\"}"))
                .andExpect(status().isNotFound());
    }
}
