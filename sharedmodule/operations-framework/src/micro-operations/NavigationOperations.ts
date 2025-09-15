/**
 * Navigation Operations - Micro-operations for web navigation functionality
 */

import BaseOperation from '../core/BaseOperation';
import {
  OperationConfig,
  OperationResult,
  OperationContext
} from '../types';

/**
 * Page Navigation Operation - Navigate to web pages
 */
export class PageNavigationOperation extends BaseOperation {
  constructor(config: OperationConfig = {}) {
    super(config);
    this.name = 'PageNavigationOperation';
    this.description = 'Navigate to web pages with wait strategies and error handling';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';

    this.abstractCategories = ['navigate-page', 'web-navigation'];
    this.supportedContainers = ['browser', 'web-page', 'any'];
    this.capabilities = ['web-navigation', 'page-loading', 'error-handling'];

    this.performance = {
      speed: 'medium',
      accuracy: 'high',
      successRate: 0.95,
      memoryUsage: 'medium'
    };

    this.requiredParameters = ['url'];
    this.optionalParameters = {
      waitUntil: 'networkidle',
      timeout: 30000,
      referer: '',
      userAgent: '',
      headers: {},
      waitForSelector: '',
      waitForFunction: '',
      retryCount: 3,
      retryDelay: 1000,
      screenshot: false,
      screenshotPath: './navigation-screenshots/'
    };
  }

  async execute(context: OperationContext, params: OperationConfig = {}): Promise<OperationResult> {
    const startTime = Date.now();
    const validation = this.validateParameters(params);

    if (!validation.isValid) {
      this.log('error', 'Parameter validation failed', { errors: validation.errors });
      throw new Error(`Parameter validation failed: ${validation.errors.join(', ')}`);
    }

    const finalParams = validation.finalParams;
    this.log('info', 'Starting page navigation', { url: finalParams.url, params: finalParams });

    try {
      if (!context.browser) {
        throw new Error('Browser context not available');
      }

      const page = context.page || await context.browser.newPage();

      // Set custom headers if provided
      if (finalParams.headers || finalParams.referer || finalParams.userAgent) {
        await page.setExtraHTTPHeaders({
          ...(finalParams.referer && { Referer: finalParams.referer }),
          ...(finalParams.userAgent && { 'User-Agent': finalParams.userAgent }),
          ...finalParams.headers
        });
      }

      // Navigation with retry logic
      let navigationResult: any = null;
      let attempt = 0;
      let lastError: Error | null = null;

      while (attempt < finalParams.retryCount) {
        attempt++;
        this.log('info', `Navigation attempt ${attempt}/${finalParams.retryCount}`);

        try {
          // Navigate to the URL
          const response = await page.goto(finalParams.url, {
            waitUntil: finalParams.waitUntil,
            timeout: finalParams.timeout
          });

          // Verify navigation was successful
          if (!response || !response.ok()) {
            throw new Error(`HTTP ${response ? response.status() : 'unknown error'}`);
          }

          // Wait for specific element if requested
          if (finalParams.waitForSelector) {
            await page.waitForSelector(finalParams.waitForSelector, {
              timeout: Math.min(finalParams.timeout, 10000)
            });
          }

          // Wait for custom function if provided
          if (finalParams.waitForFunction) {
            await page.waitForFunction(finalParams.waitForFunction, {},
              { timeout: Math.min(finalParams.timeout, 10000) }
            );
          }

          // Take screenshot if requested
          let screenshotInfo: any = null;
          if (finalParams.screenshot) {
            const screenshotName = `nav-${Date.now()}-${attempt}.png`;
            const screenshotPath = `${finalParams.screenshotPath}${screenshotName}`;
            await page.screenshot({ path: screenshotPath });
            screenshotInfo = { path: screenshotPath, name: screenshotName };
          }

          navigationResult = {
            success: true,
            url: page.url(),
            title: await page.title(),
            status: response.status(),
            headers: response.headers(),
            attempt,
            screenshot: screenshotInfo
          };

          break; // Success, exit retry loop

        } catch (error) {
          lastError = error as Error;
          this.log('warn', `Navigation attempt ${attempt} failed`, { error: (error as Error).message });

          if (attempt < finalParams.retryCount) {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, finalParams.retryDelay));
          }
        }
      }

      if (!navigationResult) {
        throw new Error(`Navigation failed after ${attempt} attempts. Last error: ${lastError?.message}`);
      }

      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);

      this.log('info', 'Page navigation completed', {
        url: navigationResult.url,
        status: navigationResult.status,
        executionTime
      });

      return {
        success: true,
        result: navigationResult,
        metadata: {
          originalUrl: finalParams.url,
          finalUrl: navigationResult.url,
          status: navigationResult.status,
          attempts: attempt,
          executionTime,
          responseHeaders: navigationResult.headers
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);

      this.log('error', 'Page navigation failed', {
        url: finalParams.url,
        error: (error as Error).message,
        executionTime
      });

      return {
        success: false,
        error: (error as Error).message,
        metadata: {
          originalUrl: finalParams.url,
          executionTime,
          attempts: attempt
        }
      };
    }
  }
}

/**
 * Element Click Operation - Click elements on web pages
 */
export class ElementClickOperation extends BaseOperation {
  constructor(config: OperationConfig = {}) {
    super(config);
    this.name = 'ElementClickOperation';
    this.description = 'Click elements on web pages with smart waiting and error handling';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';

    this.abstractCategories = ['click-element', 'web-interaction'];
    this.supportedContainers = ['web-page', 'form', 'interactive-container', 'any'];
    this.capabilities = ['element-interaction', 'web-automation', 'error-handling'];

    this.performance = {
      speed: 'fast',
      accuracy: 'high',
      successRate: 0.9,
      memoryUsage: 'low'
    };

    this.requiredParameters = ['selector'];
    this.optionalParameters = {
      timeout: 10000,
      waitForNavigation: false,
      waitUntil: 'networkidle',
      force: false,
      position: null,
      button: 'left',
      clickCount: 1,
      delay: 0,
      trial: true,
      waitForElement: true,
      waitForVisible: true,
      checkEnabled: true,
      scrollIntoView: true,
      waitForStable: true,
      stableTimeout: 2000
    };
  }

  async execute(context: OperationContext, params: OperationConfig = {}): Promise<OperationResult> {
    const startTime = Date.now();
    const validation = this.validateParameters(params);

    if (!validation.isValid) {
      this.log('error', 'Parameter validation failed', { errors: validation.errors });
      throw new Error(`Parameter validation failed: ${validation.errors.join(', ')}`);
    }

    const finalParams = validation.finalParams;
    this.log('info', 'Starting element click', { selector: finalParams.selector, params: finalParams });

    try {
      if (!context.page) {
        throw new Error('Page context not available');
      }

      const page = context.page;

      // Find the element
      let element = await page.locator(finalParams.selector);

      // Wait for element if requested
      if (finalParams.waitForElement) {
        await element.waitFor({ state: 'attached', timeout: finalParams.timeout });
      }

      // Wait for element to be visible if requested
      if (finalParams.waitForVisible) {
        await element.waitFor({ state: 'visible', timeout: finalParams.timeout });
      }

      // Check if element is enabled if requested
      if (finalParams.checkEnabled) {
        const isEnabled = await element.isEnabled();
        if (!isEnabled) {
          throw new Error('Element is not enabled');
        }
      }

      // Scroll element into view if requested
      if (finalParams.scrollIntoView) {
        await element.scrollIntoViewIfNeeded();
      }

      // Wait for element to be stable if requested
      if (finalParams.waitForStable) {
        await this.waitForElementStable(element, finalParams.stableTimeout);
      }

      // Try to click the element
      let clickResult: any = null;

      if (finalParams.waitForNavigation) {
        // Click with navigation
        const [response] = await Promise.all([
          page.waitForNavigation({ waitUntil: finalParams.waitUntil, timeout: finalParams.timeout }),
          element.click({
            force: finalParams.force,
            position: finalParams.position,
            button: finalParams.button,
            clickCount: finalParams.clickCount,
            delay: finalParams.delay,
            trial: finalParams.trial
          })
        ]);

        clickResult = {
          navigated: true,
          response: response ? {
            status: response.status(),
            url: response.url()
          } : null
        };

      } else {
        // Click without navigation
        await element.click({
          force: finalParams.force,
          position: finalParams.position,
          button: finalParams.button,
          clickCount: finalParams.clickCount,
          delay: finalParams.delay,
          trial: finalParams.trial
        });

        clickResult = { navigated: false };
      }

      // Get element information
      const elementInfo = await this.getElementInfo(element);

      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);

      this.log('info', 'Element click completed', {
        selector: finalParams.selector,
        navigated: clickResult.navigated,
        executionTime
      });

      return {
        success: true,
        result: {
          element: elementInfo,
          click: clickResult
        },
        metadata: {
          selector: finalParams.selector,
          executionTime,
          navigated: clickResult.navigated
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);

      this.log('error', 'Element click failed', {
        selector: finalParams.selector,
        error: (error as Error).message,
        executionTime
      });

      return {
        success: false,
        error: (error as Error).message,
        metadata: {
          selector: finalParams.selector,
          executionTime
        }
      };
    }
  }

  async waitForElementStable(element: any, timeout: number): Promise<void> {
    const startTime = Date.now();
    let lastPosition: any = null;

    while (Date.now() - startTime < timeout) {
      const currentPosition = await element.boundingBox();

      if (lastPosition &&
          currentPosition &&
          Math.abs(currentPosition.x - lastPosition.x) < 2 &&
          Math.abs(currentPosition.y - lastPosition.y) < 2) {
        return; // Element is stable
      }

      lastPosition = currentPosition;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error('Element did not become stable within timeout');
  }

  async getElementInfo(element: any): Promise<any> {
    try {
      return await element.evaluate((el: Element) => ({
        tagName: el.tagName,
        id: el.id || '',
        className: el.className || '',
        text: el.textContent?.trim() || '',
        href: (el as HTMLAnchorElement).href || '',
        type: (el as HTMLInputElement).type || '',
        value: (el as HTMLInputElement).value || '',
        checked: (el as HTMLInputElement).checked || false,
        disabled: (el as HTMLInputElement).disabled || false,
        visible: el.offsetParent !== null,
        boundingRect: el.getBoundingClientRect(),
        attributes: Array.from(el.attributes).reduce((acc: any, attr: Attr) => {
          acc[attr.name] = attr.value;
          return acc;
        }, {})
      }));
    } catch (error) {
      this.log('warn', 'Failed to get element info', { error: (error as Error).message });
      return {
        error: (error as Error).message
      };
    }
  }
}

/**
 * Form Fill Operation - Fill web forms
 */
export class FormFillOperation extends BaseOperation {
  constructor(config: OperationConfig = {}) {
    super(config);
    this.name = 'FormFillOperation';
    this.description = 'Fill web forms with data validation and error handling';
    this.version = '1.0.0';
    this.author = 'WebAuto Team';

    this.abstractCategories = ['fill-form', 'form-interaction', 'data-input'];
    this.supportedContainers = ['web-page', 'form', 'input-container', 'any'];
    this.capabilities = ['form-filling', 'data-input', 'validation', 'error-handling'];

    this.performance = {
      speed: 'medium',
      accuracy: 'high',
      successRate: 0.85,
      memoryUsage: 'low'
    };

    this.requiredParameters = ['formData'];
    this.optionalParameters = {
      formSelector: 'form',
      submitButton: '',
      submitForm: true,
      clearForm: true,
      validateFields: true,
      waitForNavigation: true,
      waitUntil: 'networkidle',
      fieldMapping: {},
      delayBetweenFields: 100,
      randomizeData: false,
      screenshotBefore: false,
      screenshotAfter: false,
      screenshotPath: './form-screenshots/'
    };
  }

  async execute(context: OperationContext, params: OperationConfig = {}): Promise<OperationResult> {
    const startTime = Date.now();
    const validation = this.validateParameters(params);

    if (!validation.isValid) {
      this.log('error', 'Parameter validation failed', { errors: validation.errors });
      throw new Error(`Parameter validation failed: ${validation.errors.join(', ')}`);
    }

    const finalParams = validation.finalParams;
    this.log('info', 'Starting form fill', { formData: finalParams.formData, params: finalParams });

    try {
      if (!context.page) {
        throw new Error('Page context not available');
      }

      const page = context.page;

      // Find the form
      const form = await page.locator(finalParams.formSelector).first();
      if (await form.count() === 0) {
        throw new Error(`Form not found with selector: ${finalParams.formSelector}`);
      }

      // Take screenshot before if requested
      let beforeScreenshot: any = null;
      if (finalParams.screenshotBefore) {
        const screenshotName = `form-before-${Date.now()}.png`;
        const screenshotPath = `${finalParams.screenshotPath}${screenshotName}`;
        await page.screenshot({ path: screenshotPath });
        beforeScreenshot = { path: screenshotPath, name: screenshotName };
      }

      // Clear form if requested
      if (finalParams.clearForm) {
        await this.clearForm(form);
      }

      // Fill form fields
      const fillResults = await this.fillFormFields(form, finalParams.formData, finalParams);

      // Validate fields if requested
      let validationResults: any = null;
      if (finalParams.validateFields) {
        validationResults = await this.validateFormFields(form, finalParams.formData);
      }

      // Submit form if requested
      let submitResult: any = null;
      if (finalParams.submitForm) {
        submitResult = await this.submitForm(form, page, finalParams);
      }

      // Take screenshot after if requested
      let afterScreenshot: any = null;
      if (finalParams.screenshotAfter) {
        const screenshotName = `form-after-${Date.now()}.png`;
        const screenshotPath = `${finalParams.screenshotPath}${screenshotName}`;
        await page.screenshot({ path: screenshotPath });
        afterScreenshot = { path: screenshotPath, name: screenshotName };
      }

      const executionTime = Date.now() - startTime;
      this.updateStats(true, executionTime);

      this.log('info', 'Form fill completed', {
        fieldsFilled: fillResults.success,
        validated: validationResults !== null,
        submitted: submitResult !== null,
        executionTime
      });

      return {
        success: true,
        result: {
          fillResults,
          validationResults,
          submitResult,
          screenshots: {
            before: beforeScreenshot,
            after: afterScreenshot
          }
        },
        metadata: {
          formData: finalParams.formData,
          fieldsCount: Object.keys(finalParams.formData).length,
          executionTime
        }
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.updateStats(false, executionTime);

      this.log('error', 'Form fill failed', {
        formData: finalParams.formData,
        error: (error as Error).message,
        executionTime
      });

      return {
        success: false,
        error: (error as Error).message,
        metadata: {
          formData: finalParams.formData,
          executionTime
        }
      };
    }
  }

  async clearForm(form: any): Promise<void> {
    const inputs = await form.locator('input, textarea, select').all();

    for (const input of inputs) {
      const tagName = await input.evaluate((el: Element) => el.tagName.toLowerCase());
      const type = await input.evaluate((el: HTMLInputElement) => el.type || '');

      try {
        if (tagName === 'select') {
          // Reset select to first option
          await input.selectOption({ index: 0 });
        } else if (type === 'checkbox' || type === 'radio') {
          // Uncheck checkboxes and radio buttons
          await input.uncheck();
        } else {
          // Clear text inputs
          await input.fill('');
        }
      } catch (error) {
        this.log('warn', 'Failed to clear form field', { error: (error as Error).message });
      }
    }
  }

  async fillFormFields(form: any, formData: Record<string, any>, options: OperationConfig): Promise<any> {
    const results = {
      success: [] as Array<{ field: string; value: any }>,
      failed: [] as Array<{ field: string; value: any; error: string }>,
      skipped: [] as Array<{ field: string; reason: string }>
    };

    for (const [fieldName, fieldValue] of Object.entries(formData)) {
      try {
        // Get field selector
        const fieldSelector = this.getFieldSelector(fieldName, options.fieldMapping);
        const field = form.locator(fieldSelector);

        if (await field.count() === 0) {
          results.skipped.push({ field: fieldName, reason: 'Field not found' });
          continue;
        }

        // Fill the field
        await this.fillFormField(field, fieldValue, options);
        results.success.push({ field: fieldName, value: fieldValue });

        // Delay between fields if requested
        if (options.delayBetweenFields > 0) {
          await new Promise(resolve => setTimeout(resolve, options.delayBetweenFields));
        }

      } catch (error) {
        results.failed.push({
          field: fieldName,
          value: fieldValue,
          error: (error as Error).message
        });
        this.log('warn', 'Failed to fill form field', {
          field: fieldName,
          error: (error as Error).message
        });
      }
    }

    return results;
  }

  getFieldSelector(fieldName: string, fieldMapping: Record<string, string>): string {
    // Use custom mapping if available
    if (fieldMapping[fieldName]) {
      return fieldMapping[fieldName];
    }

    // Default selectors
    const selectors = [
      `input[name="${fieldName}"]`,
      `input[id="${fieldName}"]`,
      `input[placeholder*="${fieldName}"]`,
      `textarea[name="${fieldName}"]`,
      `textarea[id="${fieldName}"]`,
      `select[name="${fieldName}"]`,
      `select[id="${fieldName}"]`,
      `*[data-field="${fieldName}"]`,
      `*[data-name="${fieldName}"]`
    ];

    return selectors.join(', ');
  }

  async fillFormField(field: any, value: any, options: OperationConfig): Promise<void> {
    const tagName = await field.evaluate((el: Element) => el.tagName.toLowerCase());
    const type = await field.evaluate((el: HTMLInputElement) => el.type || '');

    // Randomize data if requested
    let finalValue = value;
    if (options.randomizeData) {
      finalValue = this.randomizeValue(value);
    }

    switch (tagName) {
      case 'input':
        if (type === 'checkbox' || type === 'radio') {
          await field.check(finalValue);
        } else if (type === 'file') {
          await field.setInputFiles(finalValue);
        } else {
          await field.fill(finalValue);
        }
        break;

      case 'textarea':
        await field.fill(finalValue);
        break;

      case 'select':
        if (Array.isArray(finalValue)) {
          await field.selectOption(finalValue);
        } else {
          await field.selectOption({ label: finalValue });
        }
        break;

      default:
        throw new Error(`Unsupported field type: ${tagName}`);
    }
  }

  randomizeValue(value: any): any {
    if (typeof value === 'string') {
      // Add random prefix/suffix for strings
      const random = Math.random().toString(36).substring(2, 8);
      return `${random}_${value}_${random}`;
    }
    return value;
  }

  async validateFormFields(form: any, formData: Record<string, any>): Promise<any> {
    const results = {
      valid: [] as Array<{ field: string; value: any }>,
      invalid: [] as Array<{ field: string; expected: any; actual: any }>,
      required: [] as Array<{ field: string; required: boolean }>
    };

    for (const [fieldName, expectedValue] of Object.entries(formData)) {
      try {
        const fieldSelector = this.getFieldSelector(fieldName, {});
        const field = form.locator(fieldSelector);

        if (await field.count() === 0) {
          continue;
        }

        const actualValue = await field.inputValue();
        const isValid = this.validateFieldValue(actualValue, expectedValue);

        if (isValid) {
          results.valid.push({ field: fieldName, value: actualValue });
        } else {
          results.invalid.push({
            field: fieldName,
            expected: expectedValue,
            actual: actualValue
          });
        }

        // Check if field is required
        const required = await field.evaluate((el: HTMLInputElement) => el.hasAttribute('required'));
        if (required) {
          results.required.push({ field: fieldName, required: true });
        }

      } catch (error) {
        this.log('warn', 'Failed to validate form field', {
          field: fieldName,
          error: (error as Error).message
        });
      }
    }

    return results;
  }

  validateFieldValue(actual: any, expected: any): boolean {
    if (typeof expected === 'string') {
      return actual.includes(expected) || actual.toLowerCase().includes(expected.toLowerCase());
    }
    return actual == expected;
  }

  async submitForm(form: any, page: any, options: OperationConfig): Promise<any> {
    try {
      let submitButton: any = null;

      // Try to find submit button
      if (options.submitButton) {
        submitButton = form.locator(options.submitButton).first();
      }

      if (!submitButton || await submitButton.count() === 0) {
        // Look for standard submit buttons
        submitButton = form.locator('button[type="submit"], input[type="submit"]').first();
      }

      if (await submitButton.count() > 0) {
        // Click submit button
        if (options.waitForNavigation) {
          const [response] = await Promise.all([
            page.waitForNavigation({ waitUntil: options.waitUntil }),
            submitButton.click()
          ]);

          return {
            method: 'button',
            response: response ? { status: response.status(), url: response.url() } : null
          };
        } else {
          await submitButton.click();
          return { method: 'button', response: null };
        }
      } else {
        // Try form submit
        if (options.waitForNavigation) {
          const [response] = await Promise.all([
            page.waitForNavigation({ waitUntil: options.waitUntil }),
            form.evaluate((form: HTMLFormElement) => form.submit())
          ]);

          return {
            method: 'form',
            response: response ? { status: response.status(), url: response.url() } : null
          };
        } else {
          await form.evaluate((form: HTMLFormElement) => form.submit());
          return { method: 'form', response: null };
        }
      }

    } catch (error) {
      throw new Error(`Form submission failed: ${(error as Error).message}`);
    }
  }
}