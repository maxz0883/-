/* Vitalis Predict — безопасная отправка данных из браузера.
   Требует HTTPS и публичный RSA-OAEP ключ сервера.
   Приватный ключ никогда не помещается во frontend. */
(() => {
  'use strict';

  const API_URL = '/api/predictions';
  const REQUEST_TIMEOUT_MS = 15_000;
  let serverPublicKeyPem = '';

  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();

  function base64Url(bytes) {
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function pemToBytes(pem) {
    const base64 = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, '');
    const binary = atob(base64);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }

  async function importServerKey(pem) {
    if (!pem || !pem.includes('BEGIN PUBLIC KEY')) {
      throw new Error('Server public key is not configured.');
    }
    return crypto.subtle.importKey(
      'spki',
      pemToBytes(pem),
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt'],
    );
  }

  function validateInput(input) {
    if (!Number.isInteger(input.age) || input.age < 0 || input.age > 120) {
      throw new Error('Укажите возраст от 0 до 120 лет.');
    }
    if (!['female', 'male', 'other', 'unknown'].includes(input.sex)) {
      throw new Error('Выберите корректное значение пола.');
    }
    if (!input.consent) {
      throw new Error('Нужно согласие на обработку данных.');
    }
    if (!input.features || typeof input.features !== 'object') {
      throw new Error('Не заполнены данные для прогноза.');
    }
  }

  // Гибридное шифрование: данные шифруются AES-GCM, а AES-ключ — RSA ключом сервера.
  async function encryptForServer(payload) {
    const publicKey = await importServerKey(serverPublicKeyPem);
    const aesKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt'],
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = textEncoder.encode(JSON.stringify(payload));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: textEncoder.encode('vitalis-predict:v1') },
      aesKey,
      plaintext,
    );
    const rawAesKey = new Uint8Array(await crypto.subtle.exportKey('raw', aesKey));
    const encryptedAesKey = new Uint8Array(await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      publicKey,
      rawAesKey,
    ));

    return {
      version: 1,
      algorithm: 'RSA-OAEP-256+A256GCM',
      key: base64Url(encryptedAesKey),
      iv: base64Url(iv),
      data: base64Url(new Uint8Array(ciphertext)),
    };
  }

  function collectForm(form) {
    const formData = new FormData(form);
    return {
      age: Number(formData.get('age')),
      sex: String(formData.get('sex') || 'unknown'),
      features: {
        pulse: Number(formData.get('pulse')),
        temperature: Number(formData.get('temperature')),
      },
      consent: formData.get('consent') === 'on',
      requestId: crypto.randomUUID(),
    };
  }

  async function submitPrediction(form) {
    const payload = collectForm(form);
    validateInput(payload);
    const encrypted = await encryptForServer(payload);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Request-ID': payload.requestId },
        credentials: 'same-origin',
        body: JSON.stringify(encrypted),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Сервис прогноза временно недоступен.');
      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  function init({ formSelector = '#prediction-form', publicKey } = {}) {
    serverPublicKeyPem = publicKey || '';
    const form = document.querySelector(formSelector);
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const status = form.querySelector('[data-status]');
      try {
        if (status) status.textContent = 'Обработка…';
        const result = await submitPrediction(form);
        if (status) status.textContent = 'Прогноз готов.';
        form.dispatchEvent(new CustomEvent('vitalis:prediction', { detail: result }));
      } catch (error) {
        if (status) status.textContent = error.name === 'AbortError'
          ? 'Превышено время ожидания.'
          : error.message;
      }
    });
  }

  window.VitalisSecurity = { init, encryptForServer, validateInput };
})();
