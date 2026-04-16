'use strict';

const fetch = require('node-fetch');

const ML_API = 'https://api.mercadolibre.com';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getShipmentId(token, numeroPedidoLoja) {
  const resp = await fetch(`${ML_API}/orders/${numeroPedidoLoja}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`ML busca pedido ${numeroPedidoLoja} erro ${resp.status}: ${txt.slice(0, 200)}`);
  }
  const data = await resp.json();
  const shipmentId = data?.shipping?.id;
  if (!shipmentId) throw new Error(`ML: pedido ${numeroPedidoLoja} sem shipment_id`);
  return shipmentId;
}

/**
 * Consulta o substatus de um pedido ML pelo numeroLoja.
 * Retorna: 'buffered' = sem etiqueta | qualquer outro valor = tem etiqueta | null = erro
 * 
 * Lógica:
 * - Se status === 'ready_to_ship' → etiqueta disponível (independente do substatus)
 * - Se substatus !== 'buffered' → etiqueta disponível
 * - Se substatus === 'buffered' E status !== 'ready_to_ship' → sem etiqueta
 */
async function consultarSubstatusShipment(token, numeroPedidoLoja, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await sleep(300);
      const shipmentId = await getShipmentId(token, numeroPedidoLoja);
      await sleep(300);

      const resp = await fetch(`${ML_API}/shipments/${shipmentId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`ML shipment ${shipmentId} erro ${resp.status}: ${txt.slice(0, 200)}`);
      }

      const data = await resp.json();
      const status = data?.status || null;
      const substatus = data?.substatus || null;

      console.log(`[mlApi] Pedido ML ${numeroPedidoLoja} → shipment ${shipmentId} → status: ${status} | substatus: ${substatus}`);

      // Se status indica que está pronto para envio, tem etiqueta
      if (status === 'ready_to_ship') {
        return 'ready_to_ship';
      }

      return substatus;

    } catch (e) {
      if (e.message.includes('429') && attempt < retries) {
        await sleep(attempt * 2000);
        continue;
      }
      console.error(`[mlApi] Erro ao consultar pedido ML ${numeroPedidoLoja} (tentativa ${attempt}):`, e.message);
      if (attempt < retries) await sleep(1500);
    }
  }
  return null;
}

module.exports = { consultarSubstatusShipment };
