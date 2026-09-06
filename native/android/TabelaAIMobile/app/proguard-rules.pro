# TABELA AI V11
# Keep JavaScript bridge methods visible when release shrinking is enabled later.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
