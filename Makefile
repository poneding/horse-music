# 一头诗人 · 常用命令
#
# 默认目标：make help
# 本地运行：make run
# 发布镜像：make docker-login && make docker-push

SHELL := /bin/sh

REGISTRY       ?= registry.cn-hangzhou.aliyuncs.com
IMAGE          ?= $(REGISTRY)/pding/music:latest
BUILDER        ?= music-builder
PLATFORMS      ?= linux/amd64,linux/arm64
LOCAL_PLATFORM ?= linux/$(shell uname -m | sed 's/x86_64/amd64/; s/aarch64/arm64/')

PORT           ?= 4173
LOCAL_PORT     ?= 8080
DATA_DIR       ?= ./data
ADMIN_USER     ?= admin
ADMIN_PASSWORD ?=
TRUST_PROXY    ?=

NAMESPACE      ?= default
APP            ?= horse-music
SERVICE        ?= horse-music
K8S_MANIFEST   ?= k8s/music.yaml
TIMESTAMP      := $(shell date +%Y%m%d-%H%M%S)

.DEFAULT_GOAL := help
.PHONY: help install check run dev docker-login docker-builder docker-build docker-push docker-inspect \
	k8s-secrets k8s-registry-secret k8s-apply k8s-rollout k8s-status k8s-logs k8s-port-forward \
	release backup backup-local backup-k8s

help: ## 显示可用命令
	@awk 'BEGIN {FS = ":.*##"; printf "\n用法：\n  make \033[36m<target>\033[0m\n\n命令：\n"} /^[a-zA-Z0-9_-]+:.*?##/ { printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

install: ## 安装生产依赖（npm ci）
	npm ci

check: ## 检查 Node.js 语法与 package.json
	@node -e "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8'))"
	@node --check server.js
	@node --check sw.js
	@find server -name '*.js' -exec node --check {} +
	@set -e; for file in $$(find src -name '*.js'); do \
		tmp=$$(mktemp /tmp/horse-check-XXXXXX); \
		cp "$$file" "$$tmp.mjs"; \
		node --check "$$tmp.mjs"; \
		rm -f "$$tmp" "$$tmp.mjs"; \
	done
	@echo "检查通过"

run: ## 本地运行播放器（默认 4173 端口）
	@test -d node_modules || npm ci
	@echo "本地地址：http://localhost:$(PORT)"
	@echo "管理端：  http://localhost:$(PORT)/admin"
	PORT=$(PORT) DATA_DIR=$(DATA_DIR) ADMIN_USER=$(ADMIN_USER) ADMIN_PASSWORD='$(or $(ADMIN_PASSWORD),admin123)' TRUST_PROXY=$(TRUST_PROXY) npm start

dev: run ## make run 的别名

docker-login: ## 登录阿里云镜像仓库（交互式）
	docker login $(REGISTRY)

docker-builder: ## 创建并选择多架构 builder
	@if ! docker buildx inspect $(BUILDER) >/dev/null 2>&1; then \
		docker buildx create --name $(BUILDER) --driver docker-container --use; \
	else \
		docker buildx use $(BUILDER); \
	fi
	@docker buildx inspect $(BUILDER) --bootstrap >/dev/null

docker-build: docker-builder ## 构建当前机器架构的本地镜像（--load）
	docker buildx build \
		--platform $(LOCAL_PLATFORM) \
		--provenance=false --sbom=false \
		-t $(IMAGE) \
		--load .

docker-push: docker-builder ## 构建并推送 amd64/arm64 多架构镜像
	docker buildx build \
		--platform $(PLATFORMS) \
		--provenance=false --sbom=false \
		-t $(IMAGE) \
		--push .

docker-inspect: ## 查看远程镜像清单
	docker buildx imagetools inspect $(IMAGE)

k8s-secrets: ## 创建/更新管理员 Secret（需 ADMIN_PASSWORD）
	@test -n "$(ADMIN_PASSWORD)" || (echo "错误：请通过 ADMIN_PASSWORD=... 提供强密码。" >&2; exit 1)
	kubectl create secret generic music-admin \
		--from-literal=ADMIN_USER='$(ADMIN_USER)' \
		--from-literal=ADMIN_PASSWORD='$(ADMIN_PASSWORD)' \
		--namespace $(NAMESPACE) \
		--dry-run=client -o yaml | kubectl apply --namespace $(NAMESPACE) -f -

k8s-registry-secret: ## 创建/更新镜像拉取 Secret（需 REGISTRY_USER/REGISTRY_PASSWORD）
	@test -n "$(REGISTRY_USER)" && test -n "$(REGISTRY_PASSWORD)" || (echo "错误：请提供 REGISTRY_USER=... REGISTRY_PASSWORD=..." >&2; exit 1)
	kubectl create secret docker-registry aliyun-registry \
		--docker-server='$(REGISTRY)' \
		--docker-username='$(REGISTRY_USER)' \
		--docker-password='$(REGISTRY_PASSWORD)' \
		--namespace $(NAMESPACE) \
		--dry-run=client -o yaml | kubectl apply --namespace $(NAMESPACE) -f -

k8s-apply: ## 应用 Kubernetes 清单
	kubectl apply --namespace $(NAMESPACE) -f $(K8S_MANIFEST)

k8s-rollout: ## 滚动重启 Deployment 并等待完成
	kubectl --namespace $(NAMESPACE) rollout restart deployment/$(APP)
	kubectl --namespace $(NAMESPACE) rollout status deployment/$(APP)

k8s-status: ## 查看 Pod、Service 与 PVC
	kubectl --namespace $(NAMESPACE) get pods,service,pvc -o wide

k8s-logs: ## 持续查看应用日志
	kubectl --namespace $(NAMESPACE) logs -f deployment/$(APP)

k8s-port-forward: ## 端口转发 LOCAL_PORT -> Service 80（前台运行）
	kubectl --namespace $(NAMESPACE) port-forward service/$(SERVICE) $(LOCAL_PORT):80

release: docker-push ## 推送镜像并滚动重启 Kubernetes
	$(MAKE) k8s-rollout

backup: backup-local ## make backup-local 的别名

backup-local: ## 备份本地 DATA_DIR 到 outputs/
	@test -d "$(DATA_DIR)" || (echo "错误：找不到数据目录 $(DATA_DIR)" >&2; exit 1)
	mkdir -p outputs
	tar -czf outputs/data-local-$(TIMESTAMP).tar.gz -C $(dir $(DATA_DIR)) $(notdir $(DATA_DIR))
	@echo "已备份到 outputs/data-local-$(TIMESTAMP).tar.gz"

backup-k8s: ## 从 Kubernetes Pod 备份 /app/data 到 outputs/
	mkdir -p outputs
	kubectl --namespace $(NAMESPACE) exec deployment/$(APP) -- \
		tar -czf - -C /app data > outputs/data-k8s-$(TIMESTAMP).tar.gz
	@echo "已备份到 outputs/data-k8s-$(TIMESTAMP).tar.gz"
