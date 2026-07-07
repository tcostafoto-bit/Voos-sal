# Alerta de Preços — Voo + Hotel Lisboa → Sal

Sistema automático (GitHub Actions + SerpAPI + Telegram) que verifica diariamente o preço do voo direto Lisboa→Sal e do hotel Meliá Dunas Beach Resort & Spa, guarda o histórico e avisa no Telegram quando aparece uma oportunidade.

Ver [config.json](./config.json) para alvos de preço e datas, [scripts/check-prices.mjs](./scripts/check-prices.mjs) para a lógica, e a pasta [dashboard/](./dashboard/) para o painel visual (deploy em produção).

## Nota importante — preço do hotel

O preço do hotel devolvido pela SerpAPI (`google_hotels`) fica sistematicamente **~40% acima** do preço real de reserva direta em melia.com, mesmo usando a fonte oficial ("official": true) e a ocupação correta (2 adultos + 1 criança). Não é um bug de configuração — foi confirmado por comparação direta com o checkout real da Meliá (ex.: API mostrou 1903 €, site mostrou 1146,06 € para as mesmas datas/hóspedes). O desconto de reserva direta da Meliá não aparece nos dados que o Google Hotels indexa.

**Como usar o número do hotel:**
- Serve bem como **sinal de tendência** (a variação percentual dispara o alerta de queda ≥8% corretamente, já que o desvio é consistente).
- **Não confiar no valor absoluto** para decidir comprar ou para definir o `alvoTotal` sem antes confirmar manualmente em melia.com.
- Ao definir `hotel.alvoTotal` em `config.json`, considerar este desvio (ex.: se o alvo real de compra é X € no site da Meliá, definir o alvo no config como aproximadamente X × 1,6, ou simplesmente ignorar o alerta automático de "COMPRAR HOTEL" e usar só a queda percentual como gatilho para ir confirmar manualmente).

O preço do voo (`google_flights`) não tem este problema — bate certo com os preços reais da easyJet/TAP.
