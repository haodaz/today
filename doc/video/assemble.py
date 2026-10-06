"""
把旁白、字幕、片尾那张实拍图和正片合成最终片。

  python3 doc/video/assemble.py [--probe 139]

做五件事：
  · 按 narration.json 里的 at 把每段语音摆到时间轴上，混成一条
  · 把每段旁白按句子切字幕，每句分到的时长按字符数摊——
    不用手动对轴，句子长短和停留时间天然成正比
  · 正片缩放补边到 1920×1080（原始画幅 2060×844 很怪，自己补边
    比丢给 YouTube 补看起来像是故意的）
  · 片尾接一张真机实拍：整片都是屏幕采集，评委心里会有「这在真电视上
    跑过吗」这个问号。一张挂在墙上的 Fire TV 把它消掉，不用旁白解释
  · 字幕烧在下方黑边里，不压画面

--probe <秒> 只渲染那一秒附近 4 秒，用来调字幕位置，不用等整条。
"""
import json, subprocess, re, io, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
F = "/Users/aisandbox/Documents/companydata/node_modules/ffmpeg-static/ffmpeg"
CUT = os.path.expanduser("~/Desktop/today-cut.mp4")
ENDCARD = os.path.expanduser("~/Desktop/IMG_7559.png")
OUT = os.path.expanduser("~/Desktop/today-demo.mp4")

CUT_LEN = 149.434      # build.py 报的时长
END_LEN = 7.0          # 片尾那张图停多久

# 字幕落在黑边里，不压画面。MarginV 是 ASS 的脚本单位，会按
# 画面高度缩放，所以这个数只能试出来，不能算。
STYLE = ("FontName=Helvetica,FontSize=15,PrimaryColour=&H00FFFFFF,"
         "OutlineColour=&H66000000,BackColour=&H66000000,"
         "BorderStyle=4,Outline=0,Shadow=0,MarginV=4,Alignment=2")

probe = None
if "--probe" in sys.argv:
    probe = float(sys.argv[sys.argv.index("--probe") + 1])
    OUT = "/tmp/flow/probe.mp4"

narr = json.load(io.open(os.path.join(HERE, "narration.json"), encoding="utf-8"))
dur = {d["id"]: d["dur"] for d in
       json.load(io.open(os.path.join(HERE, "tts/durations.json"), encoding="utf-8"))}

# ── 字幕 ──────────────────────────────────────────────
def ts(x):
    h, m, s = int(x // 3600), int(x % 3600 // 60), x % 60
    return f"{h:02d}:{m:02d}:{s:06.3f}".replace(".", ",")

def wrap(t, n=58):
    out, cur = [], ""
    for w in t.split():
        if len(cur) + len(w) + 1 > n and cur: out.append(cur); cur = w
        else: cur = (cur + " " + w).strip()
    if cur: out.append(cur)
    if len(out) <= 2: return "\n".join(out)
    h = len(out) // 2
    return " ".join(out[:h]) + "\n" + " ".join(out[h:])

cues, k = [], 1
for seg in narr:
    sents = [x.strip() for x in re.split(r'(?<=[.!?—])\s+', seg["text"]) if x.strip()]
    merged = []
    for x in sents:                      # 太短的句子并进上一句，免得一闪而过
        if merged and len(x) < 28: merged[-1] += " " + x
        else: merged.append(x)
    total = sum(len(x) for x in merged) or 1
    t = seg["at"]
    for x in merged:
        d = dur[seg["id"]] * len(x) / total
        cues.append(f"{k}\n{ts(t)} --> {ts(t + d - 0.05)}\n{wrap(x)}\n")
        k += 1; t += d
srt = os.path.join(HERE, "subs.srt")
io.open(srt, "w", encoding="utf-8").write("\n".join(cues))

# ── 画面 ──────────────────────────────────────────────
# 实拍图是 4:3，裁成 16:9 时从上往下留 75px——上面是墙，下面切掉手机的
# 浏览器工具栏正好。
V = ("[0:v]scale=1920:-2,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,"
     "setsar=1,fps=30[main];"
     "[1:v]crop=2000:1125:0:75,scale=1920:1080,setsar=1,fps=30[end];"
     "[main][end]concat=n=2:v=1[cat];"
     f"[cat]subtitles='{srt}':fontsdir=/System/Library/Fonts:"
     f"force_style='{STYLE}'[vout]")

# ── 声音 ──────────────────────────────────────────────
inputs = ["-i", CUT, "-loop", "1", "-t", str(END_LEN), "-i", ENDCARD]
fl, mix = [], ""
for i, seg in enumerate(narr):
    inputs += ["-i", os.path.join(HERE, f"tts/{seg['id']}.wav")]
    ms = int(seg["at"] * 1000)
    fl.append(f"[{i+2}:a]aresample=48000,adelay={ms}|{ms}[a{i}]")
    mix += f"[a{i}]"
A = ";".join(fl) + f";{mix}amix=inputs={len(narr)}:normalize=0,alimiter=limit=0.9[aout]"

cmd = [F, "-loglevel", "error", "-stats", "-y", *inputs,
       "-filter_complex", f"{V};{A}", "-map", "[vout]", "-map", "[aout]",
       "-c:v", "libx264", "-preset", "medium", "-crf", "20",
       "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k"]
if probe is not None:
    cmd += ["-ss", str(probe), "-t", "4"]
cmd.append(OUT)

print(f"字幕 {k-1} 条 · 成片 {CUT_LEN + END_LEN:.1f}s"
      + (f" · 只渲染 {probe}s 起 4 秒" if probe is not None else ""))
subprocess.run(cmd, check=True)
print("→", OUT)
