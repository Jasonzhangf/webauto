"use strict";
/**
 * 简化版容器系统测试
 * 用于验证统一容器注册系统的功能
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var index_js_1 = require("./src/containers/index.js");
var index_js_2 = require("./src/containers/index.js");
// ==================== 测试运行器 ====================
var SimpleContainerTestRunner = /** @class */ (function () {
    function SimpleContainerTestRunner() {
        this.testResults = [];
        this.startTime = Date.now();
    }
    SimpleContainerTestRunner.prototype.runAllTests = function () {
        return __awaiter(this, void 0, void 0, function () {
            var error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log('🧪 开始简化版容器系统测试...');
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 6, , 7]);
                        // 测试1: 统一容器注册系统初始化
                        return [4 /*yield*/, this.runTest('统一容器注册系统初始化', this.testUnifiedRegistryInitialization)];
                    case 2:
                        // 测试1: 统一容器注册系统初始化
                        _a.sent();
                        // 测试2: 容器类型注册
                        return [4 /*yield*/, this.runTest('容器类型注册', this.testContainerTypeRegistration)];
                    case 3:
                        // 测试2: 容器类型注册
                        _a.sent();
                        // 测试3: 容器创建
                        return [4 /*yield*/, this.runTest('容器创建', this.testContainerCreation)];
                    case 4:
                        // 测试3: 容器创建
                        _a.sent();
                        // 测试4: 向后兼容性
                        return [4 /*yield*/, this.runTest('向后兼容性', this.testBackwardCompatibility)];
                    case 5:
                        // 测试4: 向后兼容性
                        _a.sent();
                        // 输出测试报告
                        this.generateTestReport();
                        return [3 /*break*/, 7];
                    case 6:
                        error_1 = _a.sent();
                        console.error('❌ 测试运行失败:', error_1);
                        return [3 /*break*/, 7];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    SimpleContainerTestRunner.prototype.runTest = function (name, testFn) {
        return __awaiter(this, void 0, void 0, function () {
            var testStartTime, result, error_2, status;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        testStartTime = Date.now();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, testFn.call(this)];
                    case 2:
                        _a.sent();
                        result = {
                            name: name,
                            success: true,
                            executionTime: Date.now() - testStartTime
                        };
                        return [3 /*break*/, 4];
                    case 3:
                        error_2 = _a.sent();
                        result = {
                            name: name,
                            success: false,
                            error: error_2.message,
                            executionTime: Date.now() - testStartTime
                        };
                        return [3 /*break*/, 4];
                    case 4:
                        this.testResults.push(result);
                        status = result.success ? '✅' : '❌';
                        console.log("  ".concat(status, " ").concat(name, " (").concat(result.executionTime, "ms)"));
                        return [2 /*return*/];
                }
            });
        });
    };
    // ==================== 测试用例 ====================
    SimpleContainerTestRunner.prototype.testUnifiedRegistryInitialization = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (!index_js_1.unifiedContainerRegistry) {
                    throw new Error('统一容器注册系统未正确初始化');
                }
                console.log('    统一容器注册系统实例已创建');
                return [2 /*return*/];
            });
        });
    };
    SimpleContainerTestRunner.prototype.testContainerTypeRegistration = function () {
        return __awaiter(this, void 0, void 0, function () {
            var containerType;
            return __generator(this, function (_a) {
                // 注册容器类型
                index_js_1.unifiedContainerRegistry.registerContainerType('TestContainer', index_js_2.BaseSelfRefreshingContainer);
                // 验证注册
                if (!index_js_1.unifiedContainerRegistry.hasContainerType('TestContainer')) {
                    throw new Error('容器类型注册失败');
                }
                containerType = index_js_1.unifiedContainerRegistry.getContainerType('TestContainer');
                if (containerType !== index_js_2.BaseSelfRefreshingContainer) {
                    throw new Error('容器类型获取失败');
                }
                console.log('    容器类型注册成功');
                return [2 /*return*/];
            });
        });
    };
    SimpleContainerTestRunner.prototype.testContainerCreation = function () {
        return __awaiter(this, void 0, void 0, function () {
            var containerTypes;
            return __generator(this, function (_a) {
                // 注册内置容器类型
                index_js_1.unifiedContainerRegistry.registerContainerType('BaseSelfRefreshingContainer', index_js_2.BaseSelfRefreshingContainer);
                index_js_1.unifiedContainerRegistry.registerContainerType('WeiboPageContainer', index_js_2.WeiboPageContainer);
                index_js_1.unifiedContainerRegistry.registerContainerType('WeiboLinkContainer', index_js_2.WeiboLinkContainer);
                containerTypes = index_js_1.unifiedContainerRegistry.getAllContainerTypes();
                if (containerTypes.length === 0) {
                    throw new Error('没有注册的容器类型');
                }
                console.log("    \u5DF2\u6CE8\u518C ".concat(containerTypes.length, " \u79CD\u5BB9\u5668\u7C7B\u578B"));
                console.log("    \u5BB9\u5668\u7C7B\u578B: ".concat(containerTypes.join(', ')));
                return [2 /*return*/];
            });
        });
    };
    SimpleContainerTestRunner.prototype.testBackwardCompatibility = function () {
        return __awaiter(this, void 0, void 0, function () {
            var legacyRegistry, containerTypes;
            return __generator(this, function (_a) {
                legacyRegistry = index_js_1.ContainerRegistry.getInstance();
                if (!legacyRegistry) {
                    throw new Error('向后兼容的容器注册器未正确初始化');
                }
                containerTypes = legacyRegistry.getAllContainerTypes();
                if (!Array.isArray(containerTypes)) {
                    throw new Error('向后兼容API返回错误类型');
                }
                console.log('    向后兼容性测试通过');
                return [2 /*return*/];
            });
        });
    };
    // ==================== 测试报告 ====================
    SimpleContainerTestRunner.prototype.generateTestReport = function () {
        var totalTests = this.testResults.length;
        var passedTests = this.testResults.filter(function (r) { return r.success; }).length;
        var failedTests = totalTests - passedTests;
        var executionTime = Date.now() - this.startTime;
        var successRate = (passedTests / totalTests) * 100;
        console.log('\n📋 测试报告:');
        console.log('============');
        this.testResults.forEach(function (test, index) {
            var status = test.success ? '✅' : '❌';
            console.log("".concat(index + 1, ". ").concat(status, " ").concat(test.name, " (").concat(test.executionTime, "ms)"));
            if (!test.success) {
                console.log("   \u5931\u8D25\u539F\u56E0: ".concat(test.error));
            }
        });
        console.log('\n📊 测试总结:');
        console.log('============');
        console.log("\u2705 \u901A\u8FC7\u6D4B\u8BD5: ".concat(passedTests, "/").concat(totalTests));
        console.log("\uD83D\uDCC8 \u6210\u529F\u7387: ".concat(successRate.toFixed(1), "%"));
        console.log("\u23F1\uFE0F \u603B\u6267\u884C\u65F6\u95F4: ".concat(executionTime, "ms"));
        if (failedTests === 0) {
            console.log('\n🎉 所有测试通过！');
        }
        else {
            console.log("\n\uD83D\uDCA5 ".concat(failedTests, " \u4E2A\u6D4B\u8BD5\u5931\u8D25"));
        }
    };
    return SimpleContainerTestRunner;
}());
// ==================== 主程序入口 ====================
function runSimpleContainerTests() {
    return __awaiter(this, void 0, void 0, function () {
        var testRunner;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('🚀 开始简化版容器系统测试');
                    console.log('==========================');
                    testRunner = new SimpleContainerTestRunner();
                    return [4 /*yield*/, testRunner.runAllTests()];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
// 如果直接运行此文件，执行测试
if (import.meta.url === "file://".concat(process.argv[1])) {
    runSimpleContainerTests()
        .then(function () {
        console.log('\n✅ 测试完成');
        process.exit(0);
    })
        .catch(function (error) {
        console.error('💥 测试失败:', error);
        process.exit(1);
    });
}
exports.default = runSimpleContainerTests;
