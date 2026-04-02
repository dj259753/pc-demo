"""
sitecustomize.py — 在 Python 进程启动时自动安装无 SSL 证书验证的 HTTPS handler。

企业内网（如腾讯）使用自签名证书拦截 HTTPS，导致 Python 的默认 SSL 验证失败。
此文件通过 PYTHONPATH 机制在 CLI 子进程启动时自动加载，对 urllib 全局安装
不验证证书的 HTTPS opener，从而让 skillhub CLI 的网络请求能够正常工作。
"""
import ssl as _ssl
import urllib.request as _urlreq

_ctx = _ssl.create_default_context()
_ctx.check_hostname = False
_ctx.verify_mode = _ssl.CERT_NONE
_urlreq.install_opener(
    _urlreq.build_opener(_urlreq.HTTPSHandler(context=_ctx))
)
