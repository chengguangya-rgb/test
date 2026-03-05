# 发票助手

一款简洁的本地发票管理APP。

## 功能
- 📄 添加PDF发票
- 🏷️ 自动分类（餐饮/交通/办公/差旅）
- ✅ 标记报销状态
- 📦 批量选择并打包下载
- 💾 本地存储，无需联网

## 构建APK（推荐方式）

### 方式1：使用 GitHub Actions（最简单）
1. 将代码推送到 GitHub 仓库
2. 在仓库 Settings → Secrets → Actions 中添加 `EXPO_TOKEN`
3. 进入 Actions → Build Android APK → Run workflow
4. 等待10-15分钟，下载生成的 APK

### 方式2：使用 EAS CLI
```bash
# 安装 EAS CLI
npm install -g eas-cli

# 登录 Expo 账号
eas login

# 构建 APK
eas build -p android --profile preview
```

### 方式3：本地开发测试
```bash
# 安装依赖
npm install

# 启动开发服务器
npx expo start

# 用 Expo Go APP 扫码预览
```

## 技术栈
- React Native
- Expo
- AsyncStorage
