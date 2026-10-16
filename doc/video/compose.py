"""
把一幕的手机和电视对齐，排到同一个 1920×1080 画面里。

  python3 doc/video/compose.py <幕名>      → takes/<幕名>/side.mp4、tv30.mp4

对齐：
  手机每一帧有浏览器给的墙钟时间戳，直接用。
  电视那条录像的 0 秒对应哪个墙钟时刻，要算：每一幕开头都在电视上按一下「下」，
  那一下之前画面静止（不出帧），所以按键之后出现的第一帧就是那一下。
  它的墙钟时刻 ≈ 那次 adb 命令返回的时刻（t1）。两者一减就是电视的零点。
  这样手机发出去、电视自己变的那几秒，就是录的时候真实过去的那几秒。
"""
import json, os, re, subprocess, sys
F = "/Users/aisandbox/Documents/companydata/node_modules/ffmpeg-static/ffmpeg"
HERE = os.path.dirname(os.path.abspath(__file__))
name = sys.argv[1]
D = os.path.join(HERE, "takes", name)
phone = json.load(open(os.path.join(D, "phone.json")))
tvlog = json.load(open(os.path.join(D, "tv.json")))

# ── 电视每一帧的时间 ─────────────────────────────────
log = subprocess.run([F, "-hide_banner", "-i", os.path.join(D, "tv.mp4"), "-vf", "showinfo", "-f", "null", "-"],
                     stdout=subprocess.PIPE, stderr=subprocess.PIPE).stderr.decode("utf-8", "replace")
pts = [float(x) for x in re.findall(r"pts_time:([\d.]+)", log)]
down = next(k for k in tvlog["keys"] if k["k"] == "DPAD_DOWN")
# 第 0 帧是开录那一刻的画面；之后静止、不出帧，直到按了「下」。
# 所以第 0 帧之后、前面有一段空白的第一帧，就是按键那一下。
change = next(p for i, p in enumerate(pts) if i >= 1 and p - pts[i-1] > 0.4)
# 按键真正落下在 adb 命令返回前一点点（设备上的 input 进程注入完才退出）
tv0 = down["t1"] - 0.1 - change                     # 电视 0 秒对应的墙钟
tv_end = tv0 + pts[-1]
print(f"电视：{len(pts)} 帧，按键那一下在录像第 {change:.2f}s")

# ── 共同的时间段 ─────────────────────────────────────
has_phone = len(phone) > 1
start = max(tv0, phone[0]["t"]) if has_phone else tv0
end = tv_end + 1.5
if has_phone: end = max(end, phone[-1]["t"] + 1.0)
dur = end - start
print(f"合成 {dur:.1f}s")

# ── 电视：变成每秒 30 帧、从 start 开始 ───────────────
tv30 = os.path.join(D, "tv30.mp4")
subprocess.run([F, "-loglevel", "error", "-y", "-i", os.path.join(D, "tv.mp4"),
  "-vf", f"setpts=PTS-STARTPTS,tpad=start_duration={max(0, tv0-start):.3f}:start_mode=clone:stop_mode=clone:stop_duration=30,"
         f"trim=start={max(0, start-tv0):.3f}:duration={dur:.3f},setpts=PTS-STARTPTS,fps=30",
  "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", tv30], check=True)

# ── 手机：按时间戳拼成视频 ───────────────────────────
ph30 = os.path.join(D, "phone30.mp4")
if has_phone:
    lst = os.path.join(D, "phone.txt")
    with open(lst, "w") as f:
        fr = [x for x in phone if x["t"] <= end]
        for i, x in enumerate(fr):
            t_next = fr[i+1]["t"] if i + 1 < len(fr) else end
            a, b = max(x["t"], start), max(t_next, start)
            if b - a <= 0: continue
            f.write(f"file 'phone/{x['file']}'\nduration {b-a:.4f}\n")
        f.write(f"file 'phone/{fr[-1]['file']}'\n")
    subprocess.run([F, "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst,
      "-vf", "fps=30,scale=1000:1820:force_original_aspect_ratio=decrease,pad=1000:1820:(ow-iw)/2:0:color=0xEEECF6",
      "-t", f"{dur:.3f}", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", ph30], check=True)

# ── 排版：手机在左，电视在右 ─────────────────────────
side = os.path.join(D, "side.mp4")
BG = "0xE9E6F2"
if has_phone:
    fc = (f"color=c={BG}:s=1920x1080:d={dur:.3f}[bg];"
          "[0]scale=1300:-2[tv];[1]scale=-2:960[ph];"
          "[bg][ph]overlay=40:60[a];[a][tv]overlay=580:(1080-h)/2,format=yuv420p")
    ins = ["-i", tv30, "-i", ph30]
else:
    fc = "[0]scale=1920:1080,format=yuv420p"; ins = ["-i", tv30]
subprocess.run([F, "-loglevel", "error", "-y", *ins, "-filter_complex", fc,
  "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-t", f"{dur:.3f}", side], check=True)
json.dump({"start": start, "end": end, "tv0": tv0}, open(os.path.join(D, "align.json"), "w"))
print("→", side)
