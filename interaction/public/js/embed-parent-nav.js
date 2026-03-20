/**
 * 嵌在 dashboard iframe 内时：返回/回主页应操作父窗口，避免在 iframe 里再打开 dashboard 造成「套娃」。
 */
(function () {
    function isEmbed() {
        try {
            return new URLSearchParams(window.location.search).get('embed') === '1';
        } catch (e) {
            return false;
        }
    }
    window.__isDashboardEmbed = isEmbed;

    function resolveDashboardUrl() {
        try {
            return new URL('dashboard.html', window.location.href).href;
        } catch (e) {
            return 'dashboard.html';
        }
    }

    /** 在父级主页内切换 Tab（不整页刷新） */
    window.__goDashboard = function (panel) {
        panel = panel || 'messages';
        if (isEmbed()) {
            try {
                if (window.parent !== window && typeof window.parent.__dashboardShowPanel === 'function') {
                    window.parent.__dashboardShowPanel(panel);
                    return;
                }
            } catch (e) {}
            try {
                if (window.top !== window) {
                    window.top.location.href = resolveDashboardUrl();
                    return;
                }
            } catch (e2) {}
        }
        window.location.href = resolveDashboardUrl();
    };

    /** 整页回到主页（用于权限不符等，必须打断 iframe） */
    window.__goDashboardFull = function () {
        try {
            if (window.top !== window) {
                window.top.location.href = resolveDashboardUrl();
                return;
            }
        } catch (e) {}
        window.location.href = resolveDashboardUrl();
    };

    function hijackBackLinks() {
        if (!isEmbed()) return;
        document.querySelectorAll('a.back').forEach(function (a) {
            var href = a.getAttribute('href') || '';
            if (href.indexOf('dashboard') === -1) return;
            a.addEventListener('click', function (e) {
                e.preventDefault();
                window.__goDashboard('messages');
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', hijackBackLinks);
    } else {
        hijackBackLinks();
    }
})();
