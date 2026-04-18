# 🔐 GUIA COMPLETO: Autenticar Vercel + PIX no Checkout

## ✅ PASSO 1: Autenticar na Vercel (JÁ INICIADO)

**Link de Autenticação Fornecido:**
```
https://vercel.com/oauth/device?user_code=CVMF-KTVB
```

### O que fazer:
1. Clique no link acima (ou copie e cole no navegador)
2. Faça login com sua **conta GitHub**
3. Autorize a Vercel a acessar sua conta
4. Você verá: "✅ Device successfully authenticated"
5. **Volte ao VS Code** e o terminal mostrará: `Success!`

---

## 📌 PASSO 2: Vincular a Pasta ao Projeto

No terminal do VS Code, digite:

```bash
npx vercel link
```

Responda assim:

```
Set up "...\Nova pasta"? → Y (ou Yes)

Which scope? → [selecione seu nome] walter-junny-santos-projects

Link to existing project? → Y

What's the name of your existing project? → Sorteiopro
```

**Sucesso quando aparecer:**
```
✅ Linked to walter-junny-santos-projects/sorteiopro
```

**Resultado esperado:**
- Uma pasta chamada `.vercel` aparecerá no seu projeto
- Isso autoriza o Copilot a fazer deploy

---

## 🔑 PASSO 3: Puxar as Variáveis de Ambiente

No terminal, digite:

```bash
npx vercel env pull .env.local
```

**Isso trará para seu computador:**
- `DATABASE_URL` (conexão Neon)
- `MERCADO_PAGO_ACCESS_TOKEN` (chave MP)
- Outras variáveis necessárias

---

## ✨ RESUMO DO QUE FOI CORRIGIDO NA API

### Problema encontrado:
O QR Code do PIX não estava sendo extraído corretamente na resposta.

### Solução aplicada:

**Arquivo: `api/create-payment.js` (linha 209)**
```javascript
// ❌ ANTES (estava errado):
qr_code: data.point_of_interaction?.qr_code || null,

// ✅ DEPOIS (agora correto):
qr_code: data.point_of_interaction?.transaction_data?.qr_code || null,
qr_code_base64: data.point_of_interaction?.transaction_data?.qr_code_base64 || null,
```

**Arquivo: `assets/js/cliente.js` (linha 519)**
```javascript
// ❌ ANTES (procurava no lugar errado):
const pixQrCode = payment.point_of_interaction?.qr_code?.in_store_order_id || 
                  payment.point_of_interaction?.qr_code?.string ||
                  payment.qr_code ||
                  null;

// ✅ DEPOIS (agora busca no lugar certo):
const pixQrCode = payment.qr_code || 
                  payment.point_of_interaction?.transaction_data?.qr_code ||
                  null;
```

---

## 🧪 TESTE APÓS COMPLETAR OS PASSOS

Quando tudo estiver linkado, rode no terminal:

```bash
node test-pix.js
```

**Você deve ver:**
```
✅ SUCESSO! Pagamento PIX criado com sucesso:
   💳 Payment ID: 154613705529
   📊 Status Mercado Pago: pending
   ✓ Tem QR Code: SIM
   📲 QR Code (primeiros 50 chars): 00020126580014br.gov.bcb.pix...
```

---

## 🚀 PRÓXIMOS PASSOS APÓS VALIDAR

1. **Test PIL Frontend**: Acesse https://sorteiopro-olive.vercel.app
2. **Teste Completo**: Clique em "Comprar cotas" → PIX → verifique o QR Code
3. **Banco de Dados**: Verifique em https://console.neon.tech se os pedidos foram salvos

---

## 📊 CHECKLIST FINAL

- [ ] Abrir link de autenticação CVMF-KTVB
- [ ] Confirmar no navegador
- [ ] Ver "Success!" no terminal
- [ ] Rodar `npx vercel link` com sucesso
- [ ] Pasta `.vercel` apareceu
- [ ] Rodar `npx vercel env pull .env.local` com sucesso
- [ ] Arquivo `.env.local` tem DATABASE_URL
- [ ] Rodar `node test-pix.js` com sucesso
- [ ] Ver QR Code na resposta
- [ ] Deploy automático funcionando

---

## ⚠️ Se algo der errado:

**Erro: "Your codebase isn't linked"**
→ Execute `npx vercel link` novamente

**Erro: "DATABASE_URL not found"**
→ Execute `npx vercel env pull .env.local` novamente

**Erro: "QR Code still not showing"**
→ Verifique que o arquivo `api/create-payment.js` tem a linha corrigida

---

**🎉 Depois que esse guia for completado, o PIX vai funcionar perfeitamente!**
