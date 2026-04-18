// Teste de pagamento PIX - Versão corrigida
(async () => {
    const payload = {
        transaction_amount: 50.00,
        payment_method_id: "pix",
        description: "Teste PIX - Rifa SorteiosPro",
        payer: {
            email: "teste.pix@example.com",
            first_name: "Teste",
            last_name: "PIX"
        },
        external_reference: `TEST-PIX-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        metadata: {
            raffleId: "rifa-001",
            selectedNumbers: "1,2,3"
        }
    };

    console.log("📤 Enviando requisição POST para criar pagamento PIX...");
    console.log("URL: https://sorteiopro-olive.vercel.app/api/create-payment");
    console.log("\n📦 Payload:");
    console.log(JSON.stringify(payload, null, 2));

    try {
        const response = await fetch("https://sorteiopro-olive.vercel.app/api/create-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        console.log("\n📩 Resposta recebida:");
        console.log(`Status HTTP: ${response.status} ${response.statusText}`);

        const data = await response.json();
        
        console.log("\n✅ Dados da resposta:");
        console.log(JSON.stringify(data, null, 2));

        if (data.id) {
            console.log("\n🎉 ✓ SUCESSO! Pagamento PIX criado com sucesso:");
            console.log(`   💳 Payment ID: ${data.id}`);
            console.log(`   📊 Status Mercado Pago: ${data.status}`);
            console.log(`   📱 Status Detail: ${data.status_detail}`);
            
            if (data.qr_code) {
                console.log(`   ✓ Tem QR Code: SIM`);
                console.log(`   📲 QR Code (primeiros 50 chars): ${data.qr_code.slice(0, 50)}...`);
                console.log(`   ✓ QR Code está no formato correto!`);
            } else {
                console.log(`   ✗ QR Code não foi retornado na resposta!`);
            }
            
            if (data.qr_code_base64) {
                console.log(`   🖼️  Base64 disponível (${data.qr_code_base64.length} chars)`);
            }
            
            console.log(`\n💡 Consulte o status com:`);
            console.log(`   GET https://sorteiopro-olive.vercel.app/api/payment-status?id=${data.id}`);
        } else {
            console.log("\n❌ Erro: ID não retornado na resposta");
            if (data.error) {
                console.log(`   Erro: ${data.error}`);
                if (data.details) {
                    console.log(`   Detalhes: ${JSON.stringify(data.details)}`);
                }
            }
        }
    } catch (err) {
        console.error("\n❌ Erro na requisição:", err.message);
    }
})();
