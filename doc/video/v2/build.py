"""
第二版成片：真 Fire TV 录屏 + 手机，按「幕」剪，配英文旁白，不烧字幕（另出 .srt）。

  python3 doc/video/v2/build.py        → ~/Desktop/today-demo-v2.mp4 + .srt

每一幕 = 几段画面 + 几句旁白。幕的长度取「画面原本多长」和「旁白念完」里长的那个；
画面不够长，就让这一幕最后一帧停住，不加速旁白、也不砍词。
唯一不动的是「手机发出去→电视自己变」那几段：原速、不剪，旁白排在它前面念完。
"""
import json, os, re, subprocess, sys, io
F = "/Users/aisandbox/Documents/companydata/node_modules/ffmpeg-static/ffmpeg"
V = os.path.dirname(os.path.abspath(__file__))
T = os.path.join(V, "..", "takes")
W = os.path.join(V, "work"); os.makedirs(W, exist_ok=True)
OUT = os.path.expanduser("~/Desktop/today-demo-v2.mp4")
def run(*a): subprocess.run([F, "-loglevel", "error", "-y", *a], check=True)

narr = {n["id"]: n for n in json.load(io.open(os.path.join(V, "narration.json"), encoding="utf-8"))}
dur = {d["id"]: d["dur"] for d in json.load(open(os.path.join(V, "tts", "durations.json")))}
take = lambda t: os.path.join(T, t, "side.mp4")

# ── 手机点开护照那一段：只有手机。电视那边用当时真实的最后一帧 ──
pp = os.path.join(W, "passport-phone.mp4")
if not os.path.exists(pp):
    ph = json.load(open(os.path.join(T, "passport-phone", "phone.json")))
    t0, end = ph[0]["t"], ph[0]["t"] + 18.0
    lst = os.path.join(W, "pp.txt")
    with open(lst, "w") as f:
        for i, x in enumerate(ph):
            nxt = ph[i+1]["t"] if i + 1 < len(ph) else end
            f.write("file '%s'\nduration %.4f\n" % (os.path.join(T, "passport-phone", "phone", x["file"]), nxt - x["t"]))
        f.write("file '%s'\n" % os.path.join(T, "passport-phone", "phone", ph[-1]["file"]))
    still = os.path.join(W, "p2-last.png")
    run("-sseof", "-0.2", "-i", os.path.join(T, "passport2", "tv30.mp4"), "-frames:v", "1", still)
    run("-f", "concat", "-safe", "0", "-i", lst, "-loop", "1", "-t", "18", "-i", still,
        "-filter_complex", "color=c=0xE9E6F2:s=1920x1080:d=18[bg];"
        "[0]fps=30,scale=1000:1820:force_original_aspect_ratio=decrease,pad=1000:1820:(ow-iw)/2:0:color=0xEEECF6,scale=-2:960[ph];"
        "[1]scale=1300:-2[tv];[bg][ph]overlay=40:60[a];[a][tv]overlay=580:(1080-h)/2,format=yuv420p",
        "-t", "18", "-r", "30", "-c:v", "libx264", "-crf", "16", pp)

def still(img, sec, name):
    out = os.path.join(W, name + ".mp4")
    run("-loop", "1", "-t", str(sec), "-i", img, "-vf", "scale=1920:1080,fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "16", out)
    return out
S = os.path.join(V, "stills")
day = [still(os.path.join(S, f"day_{h}.png"), 3.0, f"day{h}") for h in ("0710", "1230", "1820", "2145")]
endcard = still(os.path.join(S, "end.png"), 8.0, "end")
# 封面：没有它，片子第一秒是 Fire TV 桌面，看着像电视自己开机，不像一个 app
cover = os.path.join(W, "cover.mp4")
run("-loop", "1", "-t", "3.5", "-i", os.path.join(S, "cover.png"),
    "-vf", "scale=1920:1080,fps=30,fade=t=in:st=0:d=0.4,fade=t=out:st=3.0:d=0.5,format=yuv420p",
    "-c:v", "libx264", "-crf", "16", cover)

# ── 分幕。piece = (文件, 入点, 出点, 速度)；narr = [(id, 相对本幕开头的最早起点)] ──
BEATS = [
  {"name": "cover", "pieces": [(cover, 0, 3.5, 1)], "narr": []},
  # Fire TV 桌面上正好在放广告——「打开它，它卖你东西」不用演
  # 7.9–12.4 是 app 刚起来、数据还没到的那两秒（整屏二维码），跳过
  {"name": "open", "pieces": [(take("open"), 2.6, 7.9, 0.8), (take("open"), 12.4, 24.0, 1)],
   "narr": [("01", 0.3), ("02", 7.0)]},
  # 发出去在源 30.6 秒，电视自己变在 38.5 秒——这一段原速
  {"name": "phone-tv", "pieces": [(take("phone-tv"), 3.5, 12.5, 2.0), (take("phone-tv"), 15.0, 23.0, 1),
                                  (take("phone-tv"), 23.0, 30.6, 1.4), (take("phone-tv"), 30.6, 40.4, 1)],
   "narr": [("04", 4.6), ("03", 12.6), ("05", 19.3)]},
  {"name": "passport", "pieces": [(take("passport"), 9.4, 14.6, 1.4), (take("passport"), 14.6, 22.2, 1)],
   "narr": [("06", 0.4)]},
  # 顺序按真实录制的先后排——电视上的钟不能倒着走
  {"name": "saturday", "pieces": [(take("saturday"), 9.3, 16.6, 1.4), (take("saturday"), 16.6, 34.0, 1)],
   "narr": [("09", 0.3), ("10", 13.3)]},
  # 她回答 → 拆开 → 手机上点开那份拆解。旁白一句贯穿两段。
  {"name": "passport-answer", "pieces": [(take("passport2"), 9.2, 14.2, 1.4), (take("passport2"), 14.2, 21.0, 1),
                                         (pp, 7.0, 14.5, 1)],
   "narr": [("08", 5.0)]},
  {"name": "guide-tv", "pieces": [(take("guide-tv"), 4.4, 21.6, 1)], "narr": [("11", 3.0)]},
  {"name": "day", "pieces": [(d, 0, 3.0, 1) for d in day], "narr": [("12", 0.3), ("13", 6.6)]},
  {"name": "end", "pieces": [(endcard, 0, 8.0, 1)], "narr": [("14", 0.6)]},
]

clips, placed, t = [], [], 0.0
for bi, b in enumerate(BEATS):
    # 旁白先排：每句不早于自己的锚点，也不早于上一句念完 + 0.35 秒
    cur, last_end = 0.0, 0.0
    for nid, at in b["narr"]:
        s = max(at, last_end + 0.35 if last_end else at)
        placed.append((nid, t + s)); last_end = s + dur[nid]
    natural = sum((o - i) / sp for _, i, o, sp in b["pieces"])
    length = max(natural, last_end + 0.7)
    extra = length - natural
    for pi, (src, i, o, sp) in enumerate(b["pieces"]):
        out = os.path.join(W, f"b{bi:02d}p{pi}.mp4")
        hold = extra if pi == len(b["pieces"]) - 1 else 0
        run("-ss", "%.3f" % i, "-t", "%.3f" % (o - i), "-i", src,
            "-vf", "setpts=(PTS-STARTPTS)/%s,fps=30,tpad=stop_mode=clone:stop_duration=%.3f,format=yuv420p" % (sp, hold),
            "-an", "-c:v", "libx264", "-crf", "17", out)
        clips.append(out)
    print("%-15s %5.1fs → %5.1fs  （画面 %.1f，停住 %.1f）" % (b["name"], t, t + length, natural, extra))
    t += length

lst = os.path.join(W, "clips.txt")
open(lst, "w").write("".join(f"file '{c}'\n" for c in clips))
silent = os.path.join(W, "silent.mp4")
run("-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", silent)

ins, fl, mix = ["-i", silent], [], ""
for k, (nid, at) in enumerate(placed):
    ins += ["-i", os.path.join(V, "tts", f"{nid}.wav")]
    ms = int(at * 1000)
    fl.append(f"[{k+1}:a]aresample=48000,adelay={ms}|{ms}[a{k}]"); mix += f"[a{k}]"
run(*ins, "-filter_complex", ";".join(fl) + f";{mix}amix=inputs={len(placed)}:normalize=0,alimiter=limit=0.9[aout]",
    "-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", OUT)

# ── 字幕文件（不烧进画面，传 YouTube 时挂上去）：一句一条，长句按逗号拆 ──
def ts(x):
    return "%02d:%02d:%06.3f" % (x // 3600, x % 3600 // 60, x % 60)
cues, k = [], 1
for nid, at in placed:
    text = narr[nid]["text"]
    parts = [p.strip() for p in re.split(r"(?<=[.!?])\s+", text) if p.strip()]
    total = sum(len(p) for p in parts); s = at
    for p in parts:
        d = dur[nid] * len(p) / total
        cues.append(f"{k}\n{ts(s).replace('.', ',')} --> {ts(s + d - 0.05).replace('.', ',')}\n{p}\n"); k += 1; s += d
io.open(OUT.replace(".mp4", ".srt"), "w", encoding="utf-8").write("\n".join(cues))
print("成片 %.1fs → %s" % (t, OUT))
