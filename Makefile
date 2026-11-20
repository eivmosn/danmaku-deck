.DEFAULT_GOAL := help
.PHONY: help install dev server web build start test lint fmt check clean

help: ## 显示可用命令
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

install: ## 安装依赖
	pnpm install

dev: ## 同时启动服务端与前端（热重载）
	pnpm dev

server: ## 只启动服务端（tsx watch）
	pnpm --filter @ps5lb/server dev

web: ## 只启动前端（vite）
	pnpm --filter @ps5lb/web dev

build: ## 构建全部产物
	pnpm build

start: build ## 构建并运行服务端
	pnpm --filter @ps5lb/server start

test: ## 跑单元测试
	pnpm test

lint: ## oxlint 检查
	pnpm lint

fmt: ## oxfmt 格式化
	pnpm format

check: ## 提交前全量校验
	pnpm check

clean: ## 清理产物与依赖
	rm -rf node_modules apps/*/node_modules packages/*/node_modules
	rm -rf apps/*/dist packages/*/dist apps/server/logs
