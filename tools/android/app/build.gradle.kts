plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// La versión viene de package.json para que el APK, los instaladores y la web
// digan siempre lo mismo. El flujo de trabajo pasa -PnormiaVersion=1.9.0.
val normiaVersion: String = (project.findProperty("normiaVersion") as String?) ?: "1.9.0"

android {
    namespace = "co.normia.cad"
    compileSdk = 34

    defaultConfig {
        applicationId = "co.normia.cad"
        minSdk = 26
        targetSdk = 34
        versionCode = 10000 + normiaVersion.split(".").let { parts ->
            (parts.getOrNull(0)?.toIntOrNull() ?: 0) * 100 + (parts.getOrNull(1)?.toIntOrNull() ?: 0) * 10 +
                (parts.getOrNull(2)?.toIntOrNull() ?: 0)
        }
        versionName = normiaVersion
    }

    // Clave autofirmada: la genera el flujo de trabajo. Sin ella, el APK queda
    // sin firmar y Android no lo instala; la documentación lo explica.
    val keystorePath = System.getenv("NORMA_KEYSTORE")
    signingConfigs {
        if (!keystorePath.isNullOrBlank()) {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = System.getenv("NORMA_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("NORMA_KEY_ALIAS") ?: "normia"
                keyPassword = System.getenv("NORMA_KEY_PASSWORD") ?: System.getenv("NORMA_KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            if (!keystorePath.isNullOrBlank()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
        debug {
            applicationIdSuffix = ".depuracion"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        resources {
            excludes += setOf("META-INF/*.kotlin_module")
        }
    }

    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.0")
    implementation("androidx.webkit:webkit:1.11.0")
}
