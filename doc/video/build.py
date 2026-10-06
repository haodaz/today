"""
从原始录屏切出正片。

一次过完成三件事：裁边、按幕切、把等模型的死时间加速——
中间不落地，避免二次编码。

  python3 doc/video/build.py

原始录屏在桌面（文件名里 8.33.11 和 AM 之间是 U+202F 窄空格，别手敲）。
"""
import subprocess, json, glob, os, io, sys

sys.stdout.reconfigure(encoding="utf-8") if hasattr(sys.stdout,"reconfigure") else None

F = "/Users/aisandbox/Documents/companydata/node_modules/ffmpeg-static/ffmpeg"
SRC = max(glob.glob(os.path.expanduser("~/Desktop/Screen Recording*.mov")),
          key=os.path.getmtime)
OUT = os.path.expanduser("~/Desktop/today-cut.mp4")

# 顶上切 62：Chrome 那条 "started debugging this browser" 是**时有时无**的，
# 而且每次冒出来的位置还不一样（原片里 y 2–30 到 y 16–56 都出现过）。
# 只量一帧会被骗——必须抽多帧取最深的那次。右边下边切掉露出来的桌面。
CROP = "crop=2060:844:6:62"

# (起, 止, 倍速, 这是哪一幕)
SEG = [
    (  2,  16, 1.0, "1-2 电视静置 · 落地页"),
    ( 23.7, 57.5, 2.5, "3a 进入 · 登录"),
    ( 57.5, 67.5, 1.0, "3b 开口就认人"),
    ( 82,  93, 2.0, "3c 打字"),
    ( 93, 107, 1.0, "3d 发出去 → 电视自己跟上"),   # ← 不许再切
    (150, 176, 2.5, "4a 打字 护照"),
    (176, 188, 1.0, "4b 它直接给了第一步"),
    (316, 332, 1.0, "4c 电视上按进去看拆解"),
    (348, 368, 2.5, "5a 打字 周六"),
    (368, 386, 1.0, "5b 一整段判断 → 电视跟上"),
    (398, 410, 1.0, "5c 滚动读完"),
    (458, 474, 1.0, "5d 按进去 · 那张表"),
]

parts, concat, t, timeline = [], "", 0.0, []
for i, (a, b, sp, name) in enumerate(SEG):
    parts.append(f"[0:v]trim=start={a}:end={b},setpts=(PTS-STARTPTS)/{sp}[v{i}]")
    d = (b - a) / sp
    timeline.append({"i": i, "name": name, "from": round(t, 2),
                     "to": round(t + d, 2), "src": [a, b], "speed": sp})
    t += d
    concat += f"[v{i}]"

fc = (";".join(parts) + f";{concat}concat=n={len(SEG)}:v=1:a=0[cat]"
      f";[cat]{CROP},fps=30[out]")

json.dump(timeline,
          io.open(os.path.join(os.path.dirname(__file__), "timeline.json"), "w",
                  encoding="utf-8"),
          ensure_ascii=False, indent=1)
print(f"正片时长 {t:.1f}s（{int(t//60)}:{int(t%60):02d}）")
for s in timeline:
    print(f"  {s['from']:6.1f} – {s['to']:6.1f}  {s['name']}")

subprocess.run([F, "-loglevel", "error", "-stats", "-y", "-i", SRC,
                "-filter_complex", fc, "-map", "[out]",
                "-c:v", "libx264", "-preset", "medium", "-crf", "19",
                "-pix_fmt", "yuv420p", OUT], check=True)
print("→", OUT)
