from pathlib import Path

work = Path(__file__).resolve().parents[1] / 'src'
read = lambda name: (work / name).read_text(encoding='utf-8-sig')
page = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#f2f2f2">
<meta name="description" content="把喜欢的声音留在这里。收藏唱片封面、歌词与听歌回忆的私人音乐角。">
<title>我的音乐角</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script type="importmap">{"imports":{"three":"https://unpkg.com/three@0.160.0/build/three.module.js","three/addons/":"https://unpkg.com/three@0.160.0/examples/jsm/"}}</script>
<style>
'''
page += '\n'.join(read(name) for name in ['fonts.css', 'shell.css', 'music-shell.css', 'music-library.css', 'music-detail.css', 'music-player.css'])
page += '\n</style>\n</head>\n<body>\n' + read('music-body.html')
page += '''\n<script type="module">
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
'''
page += '\n'.join(read(name) for name in ['music-data.js', 'music-library.js', 'music-detail.js', 'music-player.js', 'music-app.js'])
page += '\n</script>\n</body>\n</html>\n'
output = work.parent / 'index.html'
output.write_text(page, encoding='utf-8')
print(f'{output}: {output.stat().st_size:,} bytes')
