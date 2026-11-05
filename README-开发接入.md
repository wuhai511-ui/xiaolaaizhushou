# 小拉助手开发包

本包包含本地工作台、小拉组件、服务端、数据库适配和前端素材。需 Python 3.11 或更新版本。

## 本地启动

1. 将 `demo-stores.example.json` 复制为 `demo-stores.local.json`。
2. 在本目录运行 `python server.py`，浏览器访问 `http://127.0.0.1:8098/saas.html`。不要直接双击 HTML。
3. 真实 MCP 和模型调用需要由授权管理员通过安全渠道单独配置 `test-config.local.json`，可参考 `test-config.example.json`；该文件不得提交到公开仓库。未配置时仅验证页面和示例数据。

`workbench_store.py` 默认使用本地 SQLite；现有线上 PostgreSQL、登录权限和测试数据不包含在本包中。开发者若需与现有测试环境联调，请联系管理员分配独立授权。

本包是从当前本地源码整理的开发交付，并非 GitHub main 的快照。桌面版助手安装包未包含。代码包含测试环境集成信息，请仅通过授权的私有渠道分发。
