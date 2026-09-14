import urllib.request, hashlib, re, time, sys

PROXY = sys.argv[1] if len(sys.argv) > 1 else ""
if PROXY:
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({"http": PROXY, "https": PROXY}))
else:
    opener = urllib.request.build_opener()
opener.addheaders = [("Cache-Control", "no-cache"), ("User-Agent", "Mozilla/5.0")]

BASE = "https://1873402746.github.io/mbti-test-h5/"
FILES = ["index.html", "js/app.js", "css/style.css", "test/smoke-test.js", "data/questions.json"]

def get(p):
    req = urllib.request.Request(BASE + p + "?t=" + str(int(time.time())))
    try:
        with opener.open(req, timeout=25) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, b""
    except Exception as e:
        return "ERR:" + str(e)[:60], b""

def sha(b):
    return hashlib.sha256(b).hexdigest()

print("模式:", "代理 " + PROXY if PROXY else "直连")
print("=== 线上文件与本地一致性 ===")
all_same = True
for f in FILES:
    st, body = get(f)
    try:
        local = open(f, "rb").read()
    except Exception:
        local = b""
    same = (sha(body) == sha(local)) if body else False
    if not same:
        all_same = False
    print("  %-22s %-6s %7d bytes  一致:%s" % (f, st, len(body), same))
print("  全部一致:", all_same)

st, body = get("index.html")
if body:
    html = body.decode("utf-8")
    print()
    print("=== 线上验证码页面结构 ===")
    print("  screen-gate 存在      :", 'id="screen-gate"' in html)
    print("  gate 为初始 active    :", bool(re.search(r'id="screen-gate" class="screen active"', html)))
    print("  封面已移除初始 active :", bool(re.search(r'id="screen-cover" class="screen"', html)))
    print("  验证码输入框数量      :", len(re.findall(r'class="gate-input"', html)))
st, body = get("js/app.js")
if body:
    js = body.decode("utf-8")
    print("  线上 GATE_CODE=1783   :", 'GATE_CODE = "1783"' in js)
    print("  线上含粘贴清洗逻辑    :", "clipboardData" in js)
