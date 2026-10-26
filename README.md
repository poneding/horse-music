# 一头诗人

自托管在线音乐播放器与管理端。基于 Node.js 22，使用 `music-metadata` 读取上传音频内嵌的曲名、艺人和专辑标签。曲库、上传的音乐与封面、歌词、管理员凭证哈希和登录会话都保存在 `DATA_DIR`（默认 `./data`）。

界面默认跟随设备系统主题，也可在主题菜单中固定为浅色或深色；选择保存在当前浏览器。

## 播放器与全屏歌词

开始播放后，底部播放器会一直保留：无论是切到播放器页面、管理端还是管理端登录页，只要播放队列还在，底部都会显示同一个播放器，音乐不会中断（页面之间使用前端路由，不会重新加载文档）。

点击播放器左侧的专辑封面即可展开全屏歌词，也可以点播放器右侧的「詞」按钮。全屏歌词只占据播放器上方的区域，底部播放器的播放/暂停、上一首/下一首、进度条和播放队列始终可用。全屏界面左侧是大封面、歌曲名、歌手和专辑，右侧是滚动歌词：当前行会高亮并自动居中，点击任意歌词行可以跳转到对应时间。右上角的向下尖角按钮、`Esc` 键或手机上的下滑手势都可以收起歌词面板；面板打开时切歌会保持全屏并载入新歌的歌词。桌面、手机、横屏和暗色主题都有对应布局；手机端的播放器保留播放队列按钮，点封面即可进入歌词。

## 播放队列与快捷键

底部播放器会记住上一次的播放状态：音量、静音、当前歌曲、播放进度、播放队列和随机/循环模式保存在当前浏览器，刷新页面后会恢复到原来的位置并保持暂停。歌曲列表每行右侧的 `⋯` 菜单提供「立即播放」「下一首播放」「加入播放队列」「收藏」「查看专辑」和「分享」；播放队列弹窗支持拖动排序、单曲移除和清空，同一首歌可以多次加入队列。随机播放会生成无重复的播放序列，播完一轮后才重新洗牌，「上一首」会按实际播放历史回退。

底部播放器右侧提供歌词、静音、音量与播放队列控制。快捷键：空格播放/暂停，`←` / `→` 快退/快进 5 秒（按住 Shift 为 30 秒），`M` 静音，`L` 收藏当前歌曲，`S` 切换随机播放，`R` 切换列表循环/单曲循环。

播放器接入了 Media Session：手机锁屏、通知栏、蓝牙耳机和系统媒体键会显示封面、歌名与歌手，并可控制播放、暂停、上一首、下一首和进度。

## 最近播放与播放排行

播放器会记录每次开始播放的歌曲：侧边栏「最近播放」按最后播放时间展示听过的歌曲，「播放排行」按累计播放次数排序并汇总歌手播放次数；首页也会显示最近播放和最常播放的歌曲。记录保存在 `plays.json`（每首歌的 `playCount` / `lastPlayedAt` 与最近播放列表），播放计数采用防抖写入，不会在每次播放时重写整个曲库；管理端总览可以查看并清空全部记录。同一首歌 10 秒内的重复上报只计一次。

## 收藏与跨设备同步

「我的收藏」保存在服务端 `DATA_DIR/favorites.json`，随 `/api/state` 下发，也会进入 `/app/data` 备份，因此换浏览器或换设备访问同一个实例时看到的是同一份收藏。升级后的第一次打开会把旧浏览器 localStorage 中的收藏合并到服务端，合并成功后删除旧键；合并失败时保留本地数据并在下次启动重试。收藏写入接口按 IP 限流；与播放上报一样，它不需要登录，因此如果实例暴露给不受信任的访客，对方也能修改收藏，建议仅在内网或通过反向代理鉴权使用。

## 排序、筛选与搜索

「全部歌曲」和搜索结果支持按最近添加、歌曲名、歌手、时长、播放次数排序；风格筛选从曲库中自动生成，不再写死。搜索会同时匹配歌曲、专辑、歌手和歌单，结果页顶部按专辑、歌手、歌单分组；搜索框聚焦时会显示最近搜索（保存在当前浏览器），按 Enter 或点击结果后记录。

## 分享歌曲、歌单与专辑

歌曲列表每一行的「⋯」菜单里可以分享歌曲，专辑页和歌单页顶部也可以生成分享链接。链接形如 `/s/<code>`，打开后会显示同一份内容，并把它当作播放列表：可以「播放全部」，也可以点任意一首歌开始播放。分享不需要登录，别人拿到链接即可收听。

生成分享时保存的是当时的歌曲快照：专辑和歌单都按当时的曲目顺序保存。之后歌曲被删除时，分享页会跳过已下架的歌并在简介里标注数量；整份内容都已下架时会显示失效提示。分享记录保存在 `DATA_DIR/shares.json`，最多保留 500 条并限制总曲目引用数（超出后按创建时间淘汰最旧记录）；重复分享同一份内容会复用已有链接。创建链接的接口会按 IP 限流。

## 路由与代码结构

播放器和管理端都使用真实的 URL 与 History API。导航、浏览器前进/后退、刷新和直接打开深链接都会落在对应页面；`/search` 使用查询参数保存关键词，搜索输入过程中只替换当前历史记录，避免每个字符都产生一条历史。首页的「最近播放」「播放排行」「专辑与故事」区块都提供「查看全部」入口，分别进入对应的列表页。

| 页面 | 地址 |
| --- | --- |
| 推荐首页 / 全部专辑 | `/`、`/albums` |
| 发现音乐 | `/discover` |
| 全部歌曲 / 搜索结果 | `/library`、`/search?q=关键词` |
| 最近播放 / 播放排行 / 我的收藏 | `/recent`、`/charts`、`/favorites` |
| 歌单 / 专辑 / 歌手 | `/playlists/:id`、`/albums/:id`、`/artists/:id` |
| 分享的播放列表 | `/s/:code` |
| 管理端 | `/admin`、`/admin/overview`、`/admin/tracks`、`/admin/albums`、`/admin/artists`、`/admin/playlists`、`/admin/account` |

服务端对所有应用路由返回 `index.html`，静态模块以原生 ES modules 直接运行，不需要构建步骤。代码按职责拆分：

```text
src/
  main.js         启动、路由切换与首屏加载
  core/           状态、路由、API、主题、图标等基础设施
  data/           曲库索引、派生数据、收藏与路由集合
  features/       播放器、媒体会话、歌词等有状态能力
  components/     可复用界面片段（侧边栏、播放器、列表、弹窗）
  views/          各播放器页面
  admin/          管理端布局、页面、弹窗与操作
server/
  main.js         HTTP 服务入口
  config.js       路径与运行参数
  lib/            HTTP、文件、静态资源、媒体响应
  store/          曲库、播放记录、收藏、分享记录、管理员凭证与迁移
  services/       曲库整理、封面、歌词、上传与导入
  routes/         公开 API 与管理端 API
```

`styles.css` 仍然作为统一的设计系统样式表集中维护，避免把同一组主题变量和响应式规则拆散。

## 本地运行

```sh
npm start
```

访问 `http://localhost:4173`，管理端在 `/admin`。首次启动的本地默认账号为 `admin` / `admin123`。正式部署前请设置强管理员密码；首次启动时密码会以加盐 scrypt 哈希写入 `data/auth.json`，明文密码不会写入磁盘。

登录管理端后，可在「账号设置」中修改管理员账号和密码。修改需要验证当前密码，保存后立即生效；当前设备会保持登录，其他设备上的登录会话会失效。修改结果会持久化到 `data/auth.json`，使用相同环境变量重启服务也会保留。

`ADMIN_USER` / `ADMIN_PASSWORD` 只在首次启动或这两个变量的内容发生变化时写入凭证。若需要重置忘记的密码，或希望用环境变量覆盖管理端中修改过的凭证，变更变量后重启服务即可；这会重置管理员凭证并使所有已有会话失效。

播放上报、收藏和分享创建都按客户端 IP 限流。默认使用直连地址；如果服务部署在反向代理之后，设置 `TRUST_PROXY=1`，限流会改用 `X-Forwarded-For` 的最右一项（由代理追加的真实来源）。直连暴露时不要开启该变量，否则来源可以伪造请求头绕过限流。

## Makefile 快捷命令

仓库提供了 `Makefile`，常用命令如下：

```sh
make help          # 查看全部命令
make check         # 检查 Node.js 语法和 package.json
make run           # 本地运行（可覆盖 PORT、DATA_DIR、ADMIN_USER、ADMIN_PASSWORD、TRUST_PROXY）
make docker-login  # 登录阿里云镜像仓库
make docker-push   # 构建并推送 amd64/arm64 多架构镜像
make k8s-apply     # 应用 k8s/music.yaml
make k8s-rollout   # 滚动重启并等待 Deployment 完成
make k8s-status    # 查看 Pod、Service 和 PVC
make k8s-port-forward # 转发 8080 到 Service 80
make backup-k8s    # 从 Pod 备份 /app/data 到 outputs/
```

首次部署 Kubernetes 时，可以用 Makefile 创建 Secret：

```sh
make k8s-secrets ADMIN_PASSWORD='请替换为足够长的强密码'
make k8s-registry-secret REGISTRY_USER='阿里云镜像仓库用户名' REGISTRY_PASSWORD='阿里云镜像仓库密码'
```

镜像地址和平台可用变量覆盖，例如 `make docker-push IMAGE=... PLATFORMS=linux/amd64`。

## Docker 多架构镜像

镜像地址：`registry.cn-hangzhou.aliyuncs.com/pding/music:latest`。

```sh
docker buildx create --name music-builder --driver docker-container --use
docker buildx inspect --bootstrap
docker login registry.cn-hangzhou.aliyuncs.com
docker buildx build --platform linux/amd64,linux/arm64 \
  --provenance=false --sbom=false \
  -t registry.cn-hangzhou.aliyuncs.com/pding/music:latest \
  --push .
```

若同名 builder 已存在，使用 `docker buildx use music-builder`。推送完成后，可用以下命令检查镜像清单：

```sh
docker buildx imagetools inspect registry.cn-hangzhou.aliyuncs.com/pding/music:latest
```

## Kubernetes

先在目标 namespace 创建管理员 Secret 和阿里云镜像拉取 Secret。管理员凭证由 Kubernetes Secret 提供，在首次启动或 Secret 内容变化时写入应用；不要提交到 YAML 或源码：

```sh
kubectl create secret generic music-admin \
  --from-literal=ADMIN_USER='admin' \
  --from-literal=ADMIN_PASSWORD='请替换为足够长的强密码'

kubectl create secret docker-registry aliyun-registry \
  --docker-server=registry.cn-hangzhou.aliyuncs.com \
  --docker-username='阿里云镜像仓库用户名' \
  --docker-password='阿里云镜像仓库密码'

kubectl apply -f k8s/music.yaml
kubectl -n default port-forward service/horse-music 8080:80
```

然后访问 `http://localhost:8080`。也可为 Service 配置现有 Ingress。若使用其他 namespace，创建两个 Secret 并应用资源时都指定该 namespace。

清单申请 `10Gi` ReadWriteOnce PVC，并把 `/app/data` 挂入持久卷。这里必须保持单副本：应用当前使用本地 JSON 文件存储，并不支持多个副本并发写入。容量、`storageClassName`、资源限制和 Ingress 应按集群环境调整。删除 PVC 会删除音乐和曲库数据。

端口映射为容器监听 `4173`，Kubernetes Service 提供 `80` 并转发到容器的 `4173`；Ingress 后端应指向 Service 的 `80` 端口。

Deployment 使用 `latest` 标签并设置 `imagePullPolicy: Always`。重新构建并推送后可重新应用清单以拉取最新多架构镜像；也可用 `docker buildx imagetools inspect` 查看当前 digest。

管理员凭证哈希和会话令牌哈希也保存在 PVC 的 `data/auth.json`；容器重启后登录状态可以继续有效，登出会从该文件撤销对应会话。可在管理端「账号设置」中修改账号密码，修改会写入该 PVC；Secret 只在首次启动或凭证内容变化时覆盖并重置登录会话。若更换凭证 Secret，Pod 重启时服务会更新哈希并撤销已有会话。

上传音频时会自动读取内嵌标签和封面；表单手动填写的歌曲名、演唱者、专辑和封面优先。管理端支持一次选择或拖入多首音乐（单批最多 20 首）：每个文件会先读取标签，把歌曲名、演唱者、专辑、风格和封面预览填入批量列表，可逐首展开确认或修改歌曲信息、封面和歌词，随后按顺序上传并显示进度。单首文件上限 60 MB。部分歌曲上传失败时会保留在列表中，可以直接再次点击上传重试，不会影响已经成功的歌曲。

未被修改的预填内容在入库时仍按标签处理（专辑艺人去重规则不变），修改过的字段按手填内容入库。识别到的专辑和歌手会自动创建为档案：专辑按「专辑名 + 专辑艺人」去重（没有专辑艺人标签时按专辑名去重），歌手按名称去重，因此同一张专辑的多首歌或同一位歌手的多首歌只会创建一个档案。专辑封面和歌手头像优先使用音频内嵌或手动上传的封面。文件没有相关标签时，歌曲名回退到文件名，演唱者可手动填写，专辑可留空。只保存通过图片签名校验的内嵌 JPEG、PNG、GIF、WebP 或 BMP 封面，最大 8 MB。此功能读取文件元数据，不通过声音本身识曲；完全没有标签的文件无法自动识别歌手和专辑。

## 歌曲编辑与在线歌词匹配

管理端「歌曲管理」的每一行提供三个操作：编辑歌曲、歌词、删除。

「编辑歌曲」可以修改已上传歌曲的歌曲名、演唱者、专辑、风格、时长和封面。保存时会在需要时自动创建缺失的专辑与歌手档案；更换封面后会清理不再被其他档案引用的旧封面文件。时长通常来自上传时读取的音频元数据，也可以手动修正，并会作为歌词匹配的参考。

「歌词」会以歌曲名、艺人和时长向 LRCLIB 在线搜索歌词，并按匹配度排序（歌名权重最高，时长用于区分现场版与录音室版，艺人用于消歧）。勾选任意一条结果即可在右侧预览完整歌词，点击「使用选中歌词」写入曲库；再次打开可以重新匹配其他版本、查看当前歌词来源，或用「清除歌词」删掉歌词。每条结果会标注「逐行同步」或「纯文本」，来源（LRCLIB 的曲目编号、标题、歌手、时长和应用时间）记录在 `library.json` 的 `lyricsSource` 中。对话框底部还提供手动填写/修改歌词文本的入口，支持 LRC 时间戳。

歌词匹配默认访问 `https://lrclib.net`，无需 API Key；如需使用自建或镜像实例，可设置 `LRCLIB_BASE_URL`。搜索时会以 `HorseMusic/1.0` 标识客户端并遵循 LRCLIB 的限流要求，同样的查询在 5 分钟内会使用进程内缓存。

## 管理端批量操作与存储占用

「歌曲管理」列表支持勾选多首歌曲，批量删除或加入现有歌单：批量删除会同时清理播放记录、歌单引用和媒体文件，单次最多 500 首。管理端总览新增「存储占用」，显示媒体文件总量、数据 JSON 大小以及歌曲/专辑/歌手/歌单数量。

## 拖拽排序

管理端支持用拖拽手柄调整顺序：把鼠标移到专辑卡片、歌手卡片或歌单行上，封面左上角会出现一个方形手柄，按住并拖动即可排序；触屏设备没有悬停，手柄会一直显示。点专辑卡片上的列表按钮可以调整该专辑内的曲目顺序；歌单管理中的「管理歌曲」对话框会把已选歌曲放在左侧，拖动即可调整歌单内的播放顺序，右侧可以搜索并添加歌曲，也可以移除。

专辑、歌手和歌单的顺序会同步影响播放器首页的「专辑与故事」「歌手」区块以及侧边栏歌单；专辑曲目顺序影响播放器里的专辑页；歌单内的歌曲顺序就是播放器中的播放顺序。所有顺序都会写回 `library.json`（专辑、歌手、歌单按数组顺序保存，专辑内曲目使用每首歌的 `albumOrder` 字段）。

## 安装为应用（PWA）

播放器支持安装到桌面或手机主屏，并缓存应用外壳：离线时可以打开界面并看到提示，但曲库数据与音频仍然需要连接服务端。Service Worker 只缓存 HTML、CSS、JS、字体和图标；`/api/` 与 `/media/` 始终走网络，音频不做离线缓存，避免把整个曲库塞进浏览器存储。manifest、Service Worker 和图标位于仓库根目录，Dockerfile 会一并复制。发布新版本前请同步修改 `sw.js` 里的 cache 版本号，否则浏览器可能继续使用旧外壳。

## 数据备份

备份 PVC 中的整个 `/app/data` 目录，包含 `library.json`、`plays.json`、`shares.json`、`favorites.json`、`auth.json` 和 `media/`。恢复该目录即可恢复曲库、播放记录、收藏、分享链接、上传文件及登录凭证/会话记录。
