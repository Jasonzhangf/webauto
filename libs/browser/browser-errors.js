/**
 * 浏览器相关错误类
 * 对标Python版本的异常类
 */

export class BrowserError extends Error {
    constructor(message) {
        super(message);
        this.name = 'BrowserError';
    }
}

export class BrowserNotStartedError extends BrowserError {
    constructor(message = '浏览器未启动') {
        super(message);
        this.name = 'BrowserNotStartedError';
    }
}

export class PageNotCreatedError extends BrowserError {
    constructor(message = '页面创建失败') {
        super(message);
        this.name = 'PageNotCreatedError';
    }
}

export class NavigationError extends BrowserError {
    constructor(message = '导航失败') {
        super(message);
        this.name = 'NavigationError';
    }
}

export class ElementNotFoundError extends BrowserError {
    constructor(message = '元素未找到') {
        super(message);
        this.name = 'ElementNotFoundError';
    }
}

export class TimeoutError extends BrowserError {
    constructor(message = '操作超时') {
        super(message);
        this.name = 'TimeoutError';
    }
}

export class CookieError extends BrowserError {
    constructor(message = 'Cookie操作失败') {
        super(message);
        this.name = 'CookieError';
    }
}
