# Arquivo — Lisboa → Sal (voo + hotel), fev 2027

Alerta **desligado** a 13/10/2026. Nada neste diretório é lido pelo
`scripts/check-prices.mjs`; está aqui só para consulta e para poder voltar.

- `config.json` — a configuração como estava quando foi desligado (LIS→SID,
  2 adultos + 1 criança de 4 anos, Meliá Dunas 6 noites, alvo de voo 850 €).
- `history.json` — 74 verificações, de 07/07/2026 a 18/09/2026.
- `history-alternativas.json` — as verificações de domingo às datas alternativas
  (3–9 e 5–11 de fevereiro).

Mínimos observados: voo direto 732 € (easyJet), pacote 2 675 €. Última leitura:
voo 819 €, hotel 2 465 €, pacote 3 284 €.

## Nota importante — o preço do hotel vinha errado

O preço do hotel devolvido pela SerpAPI (`google_hotels`) ficava sistematicamente
**~40% acima** do preço real de reserva direta em melia.com, mesmo usando a fonte
oficial (`"official": true`) e a ocupação correta. Não era um bug de configuração:
foi confirmado por comparação direta com o checkout da Meliá (a API mostrou
1903 €, o site 1146,06 € para as mesmas datas e hóspedes). O desconto de reserva
direta da Meliá não aparece nos dados que o Google Hotels indexa.

Servia bem como **sinal de tendência** (o desvio é consistente, por isso a queda
percentual disparava corretamente), mas **o valor absoluto não era de confiar**.
Quem voltar a ligar um alerta com hotel tem de contar com isto ao definir o alvo.

O preço do voo (`google_flights`) não tinha este problema — batia certo com os
preços reais da easyJet e da TAP.

## Para voltar a ligar

O sistema atual segue uma viagem de cada vez. Para retomar o Sal: copiar este
`config.json` para a raiz (adaptando-o ao formato novo, que já não tem hotel) e
este `history.json` para `data/history.json`. Se o hotel voltar a ser preciso, a
função `fetchHotel` está no histórico do git, em `scripts/check-prices.mjs`
antes do commit que adaptou o sistema para Mondsee.
