from pathlib import Path
import json, io, shutil
import cairosvg
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
I=ROOT/'icons'; P=ROOT/'platform'
for p in [I/'ui',I/'brand',P/'web',P/'extension/icons',P/'ios/AppIcon.appiconset',P/'android/res',P/'android/play-store']:
 p.mkdir(parents=True,exist_ok=True)
# Original, 24-unit stroke icons. No dependency on a third-party icon library.
paths={
 'chat':'<path d="M20 15a3 3 0 0 1-3 3H9l-5 3v-5a3 3 0 0 1-1-2V6a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3z"/><path d="M7 8h9M7 12h6"/>',
 'si-panel':'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M11 3v18M14 7h4M14 11h4M14 15h4"/>',
 'layers':'<path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
 'send':'<path d="M12 20V4M5 11l7-7 7 7"/>',
 'attach':'<path d="m8 13 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 0"/>',
 'format':'<path d="M4 5h16M12 5v14M8 19h8M4 5v3M20 5v3"/>',
 'globe':'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
 'topic':'<path d="M3 5h7l2 2 2-2h7v14h-7l-2 2-2-2H3zM12 7v14"/>',
 'external':'<path d="M13 4h7v7M20 4l-9 9M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>',
 'link':'<path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 0) scale(.92 1)"/>',
 'chevron-down':'<path d="m6 9 6 6 6-6"/>', 'chevron-up':'<path d="m6 15 6-6 6 6"/>', 'chevron-right':'<path d="m9 6 6 6-6 6"/>',
 'expand':'<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>',
 'collapse':'<path d="M3 8h5V3M21 8h-5V3M8 21v-5H3M16 21v-5h5"/>',
 'close':'<path d="m6 6 12 12M18 6 6 18"/>',
 'more':'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
 'check':'<path d="m5 12 4 4 10-10"/>',
 'connected':'<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/>',
 'offline':'<path d="M3 9a14 14 0 0 1 18 0M6 13a9 9 0 0 1 12 0M10 17a3 3 0 0 1 4 0M12 21h.01M3 3l18 18"/>',
 'loading':'<path d="M12 3a9 9 0 1 1-9 9"/>',
 'warning':'<path d="M12 3 2.5 20h19zM12 9v5M12 17h.01"/>',
 'info':'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7h.01"/>',
 'history':'<path d="M3 4v6h6M3 10a9 9 0 1 1 1 7M12 7v5l3 2"/>',
 'mirror':'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
 'dock-left':'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M10 3v18"/>',
 'dock-bottom':'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 14h18"/>',
 'dock-top':'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 10h18"/>',
 'gather':'<path d="M12 3v12M7 10l5 5 5-5M4 16v4h16v-4"/>',
 'track':'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
 'refresh':'<path d="M20 4v6h-6M4 20v-6h6M20 10a8 8 0 0 0-14-4M4 14a8 8 0 0 0 14 4"/>',
 'tests':'<path d="M9 3h6M10 3v7l-6 9a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2l-6-9V3M7 15h10"/>',
 'settings':'<circle cx="12" cy="12" r="3"/><path d="m9 3-1 3-3 1-2 4 2 2v3l4 3 3-1 3 1 4-3v-3l2-2-2-4-3-1-1-3z"/>',
 'filter':'<path d="M4 5h16l-6 7v6l-4 2v-8z"/>',
 'source':'<path d="M6 3h9l4 4v14H6zM15 3v5h4M9 12h7M9 16h5"/>',
 'map':'<rect x="9" y="9" width="6" height="6" rx="1"/><circle cx="4" cy="4" r="2"/><circle cx="20" cy="4" r="2"/><circle cx="12" cy="20" r="2"/><path d="m5 5 4 4m10-4-4 4m-3 6v3"/>',
 'timeline':'<path d="M4 4v16M7 6h12M7 12h8M7 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
 'image':'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="2"/><path d="m3 18 6-6 4 4 4-6 4 5"/>',
 'sun':'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
 'moon':'<path d="M20 15a9 9 0 0 1-11-11 9 9 0 1 0 11 11z"/>',
 'system':'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 17v4M8 21h8"/>',
 'arrow-down':'<path d="M12 4v16m-7-7 7 7 7-7"/>',
 'resize':'<path d="M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3"/>',
 'copy':'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
 'lock':'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
 'retry':'<path d="M20 4v6h-6M20 10a8 8 0 1 0 0 6"/>',
 'search':'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
 'networker':'<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><path d="M9 6h9v9M6 9v9h9"/>',
}
for name,p in paths.items():
 (I/'ui'/f'{name}.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">{p}</svg>\n')
(I/'ui/sprite.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg">'+''.join(f'<symbol id="{n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">{p}</symbol>' for n,p in paths.items())+'</svg>')
# The trunk and three upward conversation branches from the initial design.
# Compact geometric path, no lettering. App art is square, OS applies clipping.
mark='M50 79V21 M50 56L26 35 M26 35V23 M26 35H38 M50 43L73 22 M73 22H61 M73 22V34 M50 70L77 55 M77 55H65 M77 55V67'
def svg(bg=None,fg='#285C46',scale=1,offset=0,rounded=False):
 return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'+(f'<rect width="100" height="100" {"rx=\"19\"" if rounded else ""} fill="{bg}"/>' if bg else '')+f'<g transform="translate({offset} {offset}) scale({scale})"><path d="{mark}" fill="none" stroke="{fg}" stroke-width="6.7" stroke-linecap="round" stroke-linejoin="round"/></g></svg>'
# Avoid any transparency in Apple app icon exports.
light=svg('#285C46','#F4F7F0'); dark=svg('#172820','#A8D4B4'); maskable=svg('#285C46','#F4F7F0',.75,12.5); mono=svg(None,'#000000',.75,12.5)
for n,s in [('mark-light',svg(None,'#285C46')),('mark-dark',svg(None,'#A8D4B4')),('mark-monochrome',svg(None,'#000000')),('app-light',light),('app-dark',dark),('app-maskable',maskable),('app-rounded',svg('#285C46','#F4F7F0',rounded=True))]:
 (I/'brand'/f'{n}.svg').write_text(s)
def png(s,p,size,opaque=False):
 p.parent.mkdir(parents=True,exist_ok=True)
 data=cairosvg.svg2png(bytestring=s.encode(),output_width=size,output_height=size)
 if opaque:
  Image.open(io.BytesIO(data)).convert('RGB').save(p)
 else:p.write_bytes(data)
web=P/'web'
for n in (16,32,48,64,180,192,512):png(light,web/f'icon-{n}.png',n,True)
for n in (192,512):png(maskable,web/f'maskable-{n}.png',n,True)
png(svg('#285C46','#F4F7F0',rounded=True),web/'apple-touch-icon.png',180,True)
# Apple touch icon should be opaque, square (OS rounds); use original square.
png(light,web/'apple-touch-icon.png',180,True)
for n in (16,32,48):png(light,web/f'favicon-{n}.png',n,True)
Image.open(web/'icon-48.png').save(web/'favicon.ico',sizes=[(16,16),(32,32),(48,48)])
(web/'favicon.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><style>rect{fill:#285C46}path{stroke:#F4F7F0}@media(prefers-color-scheme:dark){rect{fill:#172820}path{stroke:#A8D4B4}}</style><rect width="100" height="100" rx="18"/><path d="'+mark+'" fill="none" stroke-width="6.7" stroke-linecap="round" stroke-linejoin="round"/></svg>')
(web/'site.webmanifest').write_text(json.dumps({'name':'Clevertree Chat','short_name':'Clevertree','display':'standalone','start_url':'/','background_color':'#F2F4EF','theme_color':'#F2F4EF','icons':[{'src':f'icon-{n}.png','sizes':f'{n}x{n}','type':'image/png','purpose':'any'} for n in (192,512)]+[{'src':f'maskable-{n}.png','sizes':f'{n}x{n}','type':'image/png','purpose':'maskable'} for n in (192,512)]},indent=2)+'\n')
for n in (16,19,24,32,38,48,64,128,256):
 for theme,s in [('light',light),('dark',dark)]:png(s,P/f'extension/icons/{theme}/icon-{n}.png',n,True)
(P/'extension/manifest-icons.fragment.json').write_text(json.dumps({'icons':{str(n):f'icons/light/icon-{n}.png' for n in (16,32,48,128)},'action':{'default_icon':{str(n):f'icons/light/icon-{n}.png' for n in (16,24,32)}}},indent=2)+'\n')
# Xcode modern universal icon with light/default, dark and tinted variants.
ios=P/'ios/AppIcon.appiconset'; tinted=svg('#FFFFFF','#000000')
entries=[]
for n,s,a in [('AppIcon',light,None),('AppIcon-Dark',dark,'dark'),('AppIcon-Tinted',tinted,'tinted')]:
 png(s,ios/f'{n}-1024.png',1024,True)
 d={'filename':f'{n}-1024.png','idiom':'universal','platform':'ios','size':'1024x1024'}
 if a:d['appearances']=[{'appearance':'luminosity','value':a}]
 entries.append(d)
(ios/'Contents.json').write_text(json.dumps({'images':entries,'info':{'author':'xcode','version':1}},indent=2)+'\n')
for n in (20,29,40,58,60,76,80,87,120,152,167,180):png(light,P/f'ios/legacy-png/icon-{n}.png',n,True)
# Android adaptive layers: 108 dp full artwork, tree fits the central safe zone.
android=P/'android/res'
for density,px,layer in [('mdpi',48,108),('hdpi',72,162),('xhdpi',96,216),('xxhdpi',144,324),('xxxhdpi',192,432)]:
 png(light,android/f'mipmap-{density}/ic_launcher.png',px,True)
 png(svg('#285C46','#F4F7F0',rounded=True),android/f'mipmap-{density}/ic_launcher_round.png',px)
 png(svg(None,'#F4F7F0',.72,14),android/f'drawable-{density}/ic_launcher_foreground.png',layer)
for sub in ['mipmap-anydpi-v26','mipmap-anydpi-v33','drawable','values','values-night']:(android/sub).mkdir(exist_ok=True)
vector=lambda color:f'<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="100" android:viewportHeight="100"><group android:scaleX="0.72" android:scaleY="0.72" android:pivotX="50" android:pivotY="50"><path android:pathData="{mark}" android:strokeColor="{color}" android:strokeWidth="6.7" android:strokeLineCap="round" android:strokeLineJoin="round" android:fillColor="#00000000"/></group></vector>'
# Vector name separate from PNG density assets to avoid resource conflicts.
(android/'drawable/ic_launcher_adaptive_foreground.xml').write_text(vector('@color/launcher_foreground'))
(android/'drawable/ic_launcher_monochrome.xml').write_text(vector('#000000'))
for sub,bg,fg in [('values','#285C46','#F4F7F0'),('values-night','#172820','#A8D4B4')]:
 (android/sub/'launcher_colors.xml').write_text(f'<resources><color name="launcher_background">{bg}</color><color name="launcher_foreground">{fg}</color></resources>')
for version in (26,33):
 s='<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@color/launcher_background"/><foreground android:drawable="@drawable/ic_launcher_adaptive_foreground"/>'+('<monochrome android:drawable="@drawable/ic_launcher_monochrome"/>' if version==33 else '')+'</adaptive-icon>'
 for n in ('ic_launcher','ic_launcher_round'):(android/f'mipmap-anydpi-v{version}/{n}.xml').write_text(s)
png(light,P/'android/play-store/icon-512.png',512,True)
# Windows / desktop install and shortcuts
for n in (16,24,32,48,64,128,256,512):png(light,P/f'desktop/icon-{n}.png',n,True)
Image.open(P/'desktop/icon-256.png').save(P/'desktop/clevertree.ico',sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
# A Safari pinned-tab / mask icon is a solid silhouette on transparent background.
(web/'safari-pinned-tab.svg').write_text(svg(None,'#000000'))
print(f'{len(paths)} interface icons; {sum(1 for p in P.rglob("*") if p.is_file())} platform files')
from PIL import ImageDraw
for p in (P/'android/res').glob('mipmap-*/ic_launcher_round.png'):
 im=Image.open(p.parent/'ic_launcher.png').convert('RGBA'); n=im.width; mask=Image.new('L',(n*4,n*4));ImageDraw.Draw(mask).ellipse((0,0,n*4-1,n*4-1),fill=255);im.putalpha(mask.resize((n,n),Image.Resampling.LANCZOS));im.save(p)
Image.open(io.BytesIO(cairosvg.svg2png(bytestring=light.encode(),output_width=1024,output_height=1024))).save(P/'desktop/clevertree.icns')
for n in (16,24,32,64):
 for theme in ('light','dark'):png((I/'brand'/f'mark-{theme}.svg').read_text(),P/f'desktop/mark-{theme}-{n}.png',n)
