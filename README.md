# 一头诗人

自托管在线音乐播放器与管理端。基于 Node.js 22，使用 `music-metadata` 读取上传音频内嵌的曲名、艺人和专辑标签。曲库、上传的音乐与封面、歌词、管理员凭证哈希和登录会话都保存在 `DATA_DIR`（默认 `./data`）。

界面默认跟随设备系统主题，也可在主题菜单中固定为浅色或深色；选择保存在当前浏览器。

## 最近播放与播放排行

播放器会记录每次开始播放的歌曲：侧边栏「最近播放」按最后播放时间展示听过的歌曲，「播放排行」按累计播放次数排序并汇总歌手播放次数；首页也会显示最近播放和最常播放的歌曲。记录跨浏览器保存在 `library.json` 的 `recentPlays` 字段以及每首歌的 `playCount` / `lastPlayedAt` 中，管理端总览可以查看并清空全部记录。同一首歌 10 秒内的重复上报只计一次。

## 本地运行

```sh
npm start
```

访问 `http://localhost:4173`，管理端在 `/admin`。首次启动的本地默认账号为 `admin` / `admin123`。正式部署前请设置强管理员密码；首次启动时密码会以加盐 scrypt 哈希写入 `data/auth.json`，明文密码不会写入磁盘。

登录管理端后，可在「账号设置」中修改管理员账号和密码。修改需要验证当前密码，保存后立即生效；当前设备会保持登录，其他设备上的登录会话会失效。修改结果会持久化到 `data/auth.json`，使用相同环境变量重启服务也会保留。

`ADMIN_USER` / `ADMIN_PASSWORD` 只在首次启动或这两个变量的内容发生变化时写入凭证。若需要重置忘记的密码，或希望用环境变量覆盖管理端中修改过的凭证，变更变量后重启服务即可；这会重置管理员凭证并使所有已有会话失效。

## Makefile 快捷命令

仓库提供了 `Makefile`，常用命令如下：

```sh
make help          # 查看全部命令
make check         # 检查 Node.js 语法和 package.json
make run           # 本地运行（可覆盖 PORT、DATA_DIR、ADMIN_USER、ADMIN_PASSWORD）
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

上传音频时会自动读取内嵌标签和封面；表单手动填写的歌曲名、演唱者、专辑和封面优先。识别到的专辑和歌手会自动创建为档案：专辑按「专辑名 + 专辑艺人」去重（没有专辑艺人标签时按专辑名去重），歌手按名称去重，因此同一张专辑的多首歌或同一位歌手的多首歌只会创建一个档案。专辑封面和歌手头像优先使用音频内嵌或手动上传的封面。文件没有相关标签时，歌曲名回退到文件名，演唱者可手动填写，专辑可留空。只保存通过图片签名校验的内嵌 JPEG、PNG、GIF、WebP 或 BMP 封面，最大 8 MB。此功能读取文件元数据，不通过声音本身识曲；完全没有标签的文件无法自动识别歌手和专辑。

## 数据备份

备份 PVC 中的整个 `/app/data` 目录，包含 `library.json`、`auth.json` 和 `media/`。恢复该目录即可恢复曲库、上传文件及登录凭证/会话记录。
