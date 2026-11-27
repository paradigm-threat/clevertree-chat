from pathlib import Path
import json
R=Path(__file__).resolve().parents[1]; T=R/'tokens'
light={'canvas':'#F2F4EF','irc':'#FFFFFF','si':'#E5ECE5','card':'#FFFFFF','subtle':'#EDF2EC','ink':'#23352B','muted':'#52665A','line':'#C5D0C5','strong-line':'#879C8B','action':'#285C46','action-ink':'#FFFFFF','action-soft':'#DCE9DD','focus':'#28684C','success':'#285C46','warning':'#80571E','danger':'#A33430','nick-alt':'#486681','nick-warm':'#805B34','shadow':'#23352B1A'}
dark={'canvas':'#141E19','irc':'#1A2520','si':'#202F27','card':'#26362D','subtle':'#2C3C33','ink':'#E6EEE6','muted':'#B0C1B5','line':'#3D5144','strong-line':'#768E7D','action':'#A8D4B4','action-ink':'#14291D','action-soft':'#324C3B','focus':'#B9E7C5','success':'#A8D4B4','warning':'#E5C38C','danger':'#F3A59E','nick-alt':'#A8C5E0','nick-warm':'#D9BB91','shadow':'#00000045'}
(T/'theme.json').write_text(json.dumps({'light':light,'dark':dark,'typography':{'ui':'Source Sans 3, Lato, sans-serif','editorial':'IBM Plex Serif, Georgia, serif','mono':'IBM Plex Mono, monospace','sizes':{'xs':12,'sm':14,'base':16,'heading':20,'title':26}},'spacing':[4,8,12,16,24,32,48],'radius':[4,6,8],'breakpoints':{'split':700,'wide':1100},'motion':{'normalMs':150,'reducedMs':0}},indent=2)+'\n')
def rule(selector,colors,scheme):return selector+' {\n  color-scheme: '+scheme+';\n'+''.join(f'  --{k}: {v};\n' for k,v in colors.items())+'}\n'
css=rule(':root, :root[data-theme="light"]',light,'light')+'@media (prefers-color-scheme: dark) {\n'+rule(':root:not([data-theme]), :root[data-theme="system"]',dark,'dark')+'}\n'+rule(':root[data-theme="dark"]',dark,'dark')+':root { --font-ui: "Source Sans 3", Lato, sans-serif; --font-editorial: "IBM Plex Serif", Georgia, serif; --font-mono: "IBM Plex Mono", monospace; --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px; --space-5:24px; --radius:6px; }\n'
(T/'theme.css').write_text(css)
# WCAG contrast checks for text pairs.
def lum(h):
 c=[int(h[i:i+2],16)/255 for i in (1,3,5)];return sum(x*y for x,y in zip([.2126,.7152,.0722],[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c]))
def contrast(a,b):x,y=sorted([lum(a),lum(b)]);return (y+.05)/(x+.05)
lines=['# Contrast checks (WCAG relative luminance)','','Text pairs, target 4.5:1. These checks do not replace full accessibility testing.','']
for n,c in [('Light',light),('Dark',dark)]:
 lines += [f'## {n}','','| Pair | Ratio |','|---|---:|']
 for fg,bg in [(a,b) for a in ('ink','muted','action','warning','danger') for b in ('canvas','irc','si','card','subtle')]+[('action-ink','action'),('nick-alt','irc'),('nick-warm','irc')]:
  r=contrast(c[fg],c[bg]);lines.append(f'| {fg} / {bg} | {r:.2f}:1 {"PASS" if r>=4.5 else "FAIL"} |')
 lines+=['']
(R/'docs/contrast.md').write_text('\n'.join(lines))
