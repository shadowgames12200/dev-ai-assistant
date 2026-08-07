/**
 * Web Navigator Module
 * Permite que a IA navegue em sites complexos, clique em botões e extraia dados
 * Usa Playwright para automação de navegador
 */

import { chromium, Browser, Page } from "playwright";

export interface NavigationStep {
  action: "goto" | "click" | "fill" | "extract" | "wait" | "screenshot";
  target?: string;
  value?: string;
  result?: string;
  timestamp: number;
}

export interface WebNavigationResult {
  steps: NavigationStep[];
  extractedData: Record<string, any>;
  finalUrl: string;
  screenshot?: string;
  success: boolean;
  error?: string;
}

class WebNavigator {
  private browser: Browser | null = null;
  private timeout: number = 30000; // 30 segundos

  /**
   * Inicializa o navegador
   */
  async initialize(): Promise<void> {
    if (this.browser) return;

    try {
      this.browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      console.log("[WebNavigator] Navegador inicializado");
    } catch (err) {
      console.error("[WebNavigator] Erro ao inicializar:", err);
      throw err;
    }
  }

  /**
   * Navega para uma URL
   */
  async navigateTo(url: string): Promise<Page> {
    await this.initialize();

    const page = await this.browser!.newPage();
    page.setDefaultTimeout(this.timeout);

    try {
      await page.goto(url, { waitUntil: "networkidle" });
      console.log(`[WebNavigator] Navegou para: ${url}`);
      return page;
    } catch (err) {
      await page.close();
      throw err;
    }
  }

  /**
   * Clica em um elemento
   */
  async clickElement(page: Page, selector: string): Promise<void> {
    try {
      await page.click(selector);
      console.log(`[WebNavigator] Clicou em: ${selector}`);
    } catch (err) {
      console.warn(`[WebNavigator] Não conseguiu clicar em ${selector}:`, err);
      throw err;
    }
  }

  /**
   * Preenche um campo de formulário
   */
  async fillField(page: Page, selector: string, value: string): Promise<void> {
    try {
      await page.fill(selector, value);
      console.log(`[WebNavigator] Preencheu ${selector} com: ${value}`);
    } catch (err) {
      console.warn(`[WebNavigator] Não conseguiu preencher ${selector}:`, err);
      throw err;
    }
  }

  /**
   * Extrai dados da página usando seletores CSS ou XPath
   */
  async extractData(
    page: Page,
    selectors: Record<string, string>
  ): Promise<Record<string, any>> {
    const data: Record<string, any> = {};

    for (const [key, selector] of Object.entries(selectors)) {
      try {
        const element = await page.$(selector);
        if (element) {
          data[key] = await element.textContent();
        } else {
          data[key] = null;
        }
      } catch (err) {
        console.warn(`[WebNavigator] Erro ao extrair ${key}:`, err);
        data[key] = null;
      }
    }

    return data;
  }

  /**
   * Aguarda um elemento aparecer
   */
  async waitForElement(page: Page, selector: string, timeout: number = 5000): Promise<void> {
    try {
      await page.waitForSelector(selector, { timeout });
      console.log(`[WebNavigator] Elemento encontrado: ${selector}`);
    } catch (err) {
      console.warn(`[WebNavigator] Timeout aguardando ${selector}`);
      throw err;
    }
  }

  /**
   * Tira uma screenshot da página
   */
  async takeScreenshot(page: Page): Promise<Buffer> {
    return await page.screenshot({ fullPage: true });
  }

  /**
   * Executa uma sequência de ações
   */
  async executeSequence(
    url: string,
    actions: Array<{
      type: "goto" | "click" | "fill" | "extract" | "wait" | "screenshot";
      target?: string;
      value?: string;
      selectors?: Record<string, string>;
    }>
  ): Promise<WebNavigationResult> {
    const steps: NavigationStep[] = [];
    let page: Page | null = null;
    let extractedData: Record<string, any> = {};
    let screenshot: string | undefined;

    try {
      page = await this.navigateTo(url);

      for (const action of actions) {
        const step: NavigationStep = {
          action: action.type,
          target: action.target,
          value: action.value,
          timestamp: Date.now(),
        };

        try {
          switch (action.type) {
            case "goto":
              await page.goto(action.target || url, { waitUntil: "networkidle" });
              step.result = `Navegou para ${action.target}`;
              break;

            case "click":
              if (!action.target) throw new Error("Target é obrigatório para click");
              await this.clickElement(page, action.target);
              step.result = `Clicou em ${action.target}`;
              break;

            case "fill":
              if (!action.target || !action.value) throw new Error("Target e value são obrigatórios");
              await this.fillField(page, action.target, action.value);
              step.result = `Preencheu ${action.target}`;
              break;

            case "extract":
              if (!action.selectors) throw new Error("Selectors são obrigatórios");
              extractedData = await this.extractData(page, action.selectors);
              step.result = `Extraído ${Object.keys(extractedData).length} campos`;
              break;

            case "wait":
              if (!action.target) throw new Error("Target é obrigatório para wait");
              await this.waitForElement(page, action.target, 5000);
              step.result = `Aguardou elemento ${action.target}`;
              break;

            case "screenshot":
              const screenshotBuffer = await this.takeScreenshot(page);
              screenshot = screenshotBuffer.toString("base64");
              step.result = `Screenshot capturada`;
              break;
          }

          steps.push(step);
        } catch (err) {
          step.result = `Erro: ${(err as Error).message}`;
          steps.push(step);
          console.warn(`[WebNavigator] Erro na ação ${action.type}:`, err);
        }
      }

      return {
        steps,
        extractedData,
        finalUrl: page.url(),
        screenshot,
        success: true,
      };
    } catch (err) {
      return {
        steps,
        extractedData,
        finalUrl: url,
        success: false,
        error: (err as Error).message,
      };
    } finally {
      if (page) await page.close();
    }
  }

  /**
   * Fecha o navegador
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.log("[WebNavigator] Navegador fechado");
    }
  }
}

export const webNavigator = new WebNavigator();

/**
 * Wrapper para navegação web
 */
export async function navigateAndExtract(
  url: string,
  actions: Array<{
    type: "goto" | "click" | "fill" | "extract" | "wait" | "screenshot";
    target?: string;
    value?: string;
    selectors?: Record<string, string>;
  }>
): Promise<WebNavigationResult> {
  return await webNavigator.executeSequence(url, actions);
}
