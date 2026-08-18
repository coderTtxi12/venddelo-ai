plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    id("com.google.gms.google-services")
}

fun loadRiderEnv(file: java.io.File): Map<String, String> {
    if (!file.exists()) {
        return emptyMap()
    }
    return file.readLines()
        .map { it.trim() }
        .filter { it.isNotEmpty() && !it.startsWith("#") && it.contains("=") }
        .associate { line ->
            val idx = line.indexOf("=")
            line.substring(0, idx).trim() to line.substring(idx + 1).trim().trim('"')
        }
}

val riderEnv = loadRiderEnv(rootProject.file("../.env"))
val googleMapsApiKey = riderEnv["GOOGLE_MAPS_API_KEY"].orEmpty()

android {
    namespace = "com.mexy.mexy_rider"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.mexy.mexy_rider"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = 24
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        manifestPlaceholders["GOOGLE_MAPS_API_KEY"] = googleMapsApiKey
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

// Physical phones use API_BASE_URL=localhost. Re-apply USB reverse after every
// install because `adb reverse` is cleared when the cable or flutter run reconnects.
afterEvaluate {
    val adb = java.io.File(android.sdkDirectory, "platform-tools/adb")
    tasks.matching { it.name.startsWith("install") }.configureEach {
        doLast {
            exec {
                commandLine(adb.absolutePath, "reverse", "tcp:8080", "tcp:8080")
                isIgnoreExitValue = true
            }
        }
    }
}
