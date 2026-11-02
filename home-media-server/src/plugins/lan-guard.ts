import { BlockList, isIP } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { forbiddenNetwork } from '../errors/app-error.js';

/** Faixas de rede consideradas "locais". Usamos BlockList como allowlist. */
const localNetworks = new BlockList();
localNetworks.addSubnet('127.0.0.0', 8, 'ipv4'); // loopback
localNetworks.addSubnet('10.0.0.0', 8, 'ipv4'); // privada (RFC 1918)
localNetworks.addSubnet('172.16.0.0', 12, 'ipv4'); // privada (RFC 1918)
localNetworks.addSubnet('192.168.0.0', 16, 'ipv4'); // privada (RFC 1918)
localNetworks.addSubnet('169.254.0.0', 16, 'ipv4'); // link-local
localNetworks.addAddress('::1', 'ipv6'); // loopback
localNetworks.addSubnet('fc00::', 7, 'ipv6'); // unique local
localNetworks.addSubnet('fe80::', 10, 'ipv6'); // link-local

const IPV4_MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

export function isLocalNetworkAddress(address: string | undefined): boolean {
  if (address === undefined) return false;

  let ip = address;
  const zoneIndex = ip.indexOf('%'); // ex.: fe80::1%eth0
  if (zoneIndex !== -1) ip = ip.slice(0, zoneIndex);

  const mapped = IPV4_MAPPED.exec(ip);
  if (mapped?.[1] !== undefined) ip = mapped[1];

  const family = isIP(ip);
  if (family === 0) return false;
  return localNetworks.check(ip, family === 4 ? 'ipv4' : 'ipv6');
}

/**
 * Recusa requisições de IPs fora da rede local. É uma camada extra:
 * a proteção principal continua sendo não abrir a porta no roteador
 * e liberar o firewall do Windows apenas para o perfil "Privado".
 */
export function registerLanGuard(app: FastifyInstance): void {
  app.addHook('onRequest', async (request) => {
    if (!isLocalNetworkAddress(request.ip)) {
      request.log.warn({ ip: request.ip }, 'Requisição recusada: origem fora da rede local');
      throw forbiddenNetwork();
    }
  });
}
