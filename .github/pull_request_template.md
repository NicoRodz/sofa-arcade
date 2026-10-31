## Qué cambia y por qué

<!-- Una o dos frases: qué cambia y qué problema resuelve. -->

## Checklist

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test:fast`
- [ ] `npm run deps` (la plataforma no importa juegos ni apps)
- [ ] `npm run baseline:check` verde (o explico abajo por qué no)
- [ ] Archivos ≤300 líneas; no borré, salté ni renombré tests sin justificarlo aquí

## Evidencia

- **Capturas antes/después** (si cambia algo visible, incluidas las de `docs/screens/**`):
- **Goldens o hashes regrabados y su motivo** (qué regla cambió; confirma que los goldens sin flags no se movieron):
- **Sabotaje de tests nuevos** (qué rompiste a mano y que el test se puso en rojo):

## Riesgos

<!-- Qué puede romperse, qué no probaste. -->

## Cómo probarlo en el celular

<!-- Pasos: levantar el servidor, abrir la URL/QR en el celular, qué mirar. -->

---
Este PR lo aprueba alguien distinto del autor.
