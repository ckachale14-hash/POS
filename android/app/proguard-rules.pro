# Keep AIDL generated stubs
-keep class woyou.aidlservice.** { *; }
-keep interface woyou.aidlservice.** { *; }

# Keep the JS bridge so @JavascriptInterface methods aren't stripped
-keepclassmembers class com.portionspot.pos.SunmiPrinterBridge {
    @android.webkit.JavascriptInterface <methods>;
}
