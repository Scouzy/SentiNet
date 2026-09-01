// ─────────────────────────────────────────────────────────────────────────────
//  Triage — action attendue par type d'alerte (miroir client de la logique
//  serveur dans /api/alerts/bulk). Indique quoi faire et quelle IP cibler.
// ─────────────────────────────────────────────────────────────────────────────

export function recommendation(a) {
  const t = String(a?.type || '')
  if (/IoC — IP malveillante|Port C2 connu/i.test(t))
    return { action: 'block', target: a?.destination, label: 'Bloquer la destination', tone: 'critical' }
  if (/Beaconing/i.test(t))
    return { action: 'block', target: a?.destination, label: 'Bloquer + investiguer', tone: 'high' }
  if (/Balayage/i.test(t))
    return { action: 'block', target: a?.source, label: 'Bloquer la source', tone: 'high' }
  if (/latéral/i.test(t))
    return { action: 'investigate', target: a?.source, label: 'Investiguer l’hôte', tone: 'high' }
  if (/Pic de trafic/i.test(t))
    return { action: 'investigate', target: a?.source, label: 'Vérifier exfiltration', tone: 'medium' }
  if (/réputation \(flux public\)/i.test(t))
    return { action: 'close', target: a?.destination, label: 'Enrichissement — clôturer si bénin', tone: 'low' }
  return { action: 'investigate', target: a?.source, label: 'Investiguer', tone: 'medium' }
}

export const ACTION_LABELS = {
  block: 'Bloquer',
  investigate: 'Investiguer',
  close: 'Clôturer',
}

// Une alerte est « orpheline » si elle provient d'une sonde-agent qui n'existe
// plus (ancien agentId), donc non rattachée à un capteur actif : backlog non
// actionnable dans la topologie courante.
export function isOrphan(a, liveProbeIds) {
  const p = a?.probe
  if (!p || p === 'LOCAL' || p === 'SENSOR-LOCAL') return false
  return !liveProbeIds.has(p)
}
