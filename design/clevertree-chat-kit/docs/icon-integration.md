# Icon integration

The branch mark uses three upward branches. 48 UI icons use 24×24 viewBox and 1.7 stroke. SVGs inherit currentColor when inlined or used via sprite. Use semantic colors, aria-hidden for decorative marks, and accessible names for icon-only buttons.

## Web/PWA
Copy `platform/web/` to a public assets directory. Adjust paths and manifest start_url. Example:
```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="alternate icon" href="/favicon.ico">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#F2F4EF" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#141E19" media="(prefers-color-scheme: dark)">
```
SVG favicon follows browser theme; ICO is fixed fallback. PWA manifest contains 192/512 any-purpose and maskable icons; installed icon appearance varies by platform. Safari mask icon included. No service worker supplied.

## Browser extension
Merge `platform/extension/manifest-icons.fragment.json` into actual extension manifest. Light/dark PNGs in 16,19,24,32,38,48,64,128,256px. Manifest uses stable default green badge. Runtime appearance can use the supplied dark variant via the appropriate browser API (e.g. chrome.action.setIcon); test OS changes. Fragment does not implement side panel or permissions.

## iOS/iPadOS
Copy `platform/ios/AppIcon.appiconset` to Xcode asset catalog; opaque 1024px universal default, dark and grayscale tinted versions. Legacy PNGs cover commonly used sizes. Create older catalog entries in Xcode as required. Do not pre-round app icons; test target OS/Xcode before submission.

## Android
Copy `platform/android/res/` into module resources; manifest references @mipmap/ic_launcher and @mipmap/ic_launcher_round. Adaptive icons in mipmap-anydpi-v26; v33 adds monochrome layer. Theme colors in values/values-night. Legacy mdpi–xxxhdpi PNGs and extra foreground density exports included. Play Store opaque 512px. Test launcher masks and Android Studio. No APK.

## Desktop
PNG sizes 16–512, multi-resolution Windows ICO and macOS ICNS. Light/dark transparent status marks are included. Use PNGs for Linux packaging. No installer supplied.

## Rebuild
Python generators: `python source/build_icons.py` (Pillow, CairoSVG); `python source/build_tokens.py` (standard library). SVG source editable directly.
