# Dockerfile for SillyTavern Telegram Bridge Server
# 使用 node:18-alpine 作为基础镜像，体积小且安全性好

FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json (如果存在)
COPY package*.json ./

# 安装生产依赖
RUN npm ci --only=production

# 复制服务器代码
COPY . .

# 暴露 WebSocket 端口
EXPOSE 2333

# 设置启动命令
CMD ["node", "server.js"]
