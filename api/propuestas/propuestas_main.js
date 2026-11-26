const router = require("express").Router();
const db = require("../../config/db");

router.get("/recibidas", (req, res) => {
  const id_usuario = req.user.id;

  const consulta = `
    SELECT
      pr.id_propuesta,
      pr.publicacion_intercambio,
      pr.fecha,
      pr.mensaje,
      ep.estado_propuesta,
      u.nombre AS usuario,
      po.nombre AS prenda_publicada,
      po.imagen AS imagen_publicada,
      pf.id_prenda AS id_prenda_ofrecida,
      pf.nombre AS prenda_ofrecida,
      pf.imagen AS imagen_ofrecida,
      pf.privacidad AS privacidad_ofrecida,
      ca.categoria AS categoria_ofrecida,
      ta.talla AS talle_ofrecido,
      te.temporada AS temporada_ofrecida,
      epr.estado_prenda AS estado_ofrecido,
      oc.ocacion AS ocasion_ofrecida,
      g.genero AS genero_ofrecido,
      co.color AS color_ofrecido,
      co.codigo AS codigo_color_ofrecido,
      (
        SELECT JSON_ARRAYAGG(e.estilo)
        FROM prendas_estilos pe
        INNER JOIN estilos e ON pe.id_estilo = e.id_estilo
        WHERE pe.id_prenda = pf.id_prenda
      ) AS estilos_ofrecidos
    FROM propuestas pr
    INNER JOIN publicaciones_intercambio pi
      ON pr.publicacion_intercambio = pi.Id_publicacion_intercambio
    INNER JOIN prendas po
      ON pi.id_prenda = po.id_prenda
    INNER JOIN prendas pf
      ON pr.prenda_ofrecida = pf.id_prenda
    INNER JOIN usuarios u
      ON pr.id_usuario = u.Id_usuario
    INNER JOIN estados_propuestas ep
      ON pr.estado_propuesta = ep.Id_estado_propuesta
    LEFT JOIN categorias ca
      ON pf.id_categoria = ca.id_categoria
    LEFT JOIN tallas ta
      ON pf.id_talla = ta.id_talla
    LEFT JOIN temporadas te
      ON pf.id_temporada = te.id_temporada
    LEFT JOIN estados_prenda epr
      ON pf.id_estado_prenda = epr.id_estado_prenda
    LEFT JOIN ocaciones oc
      ON pf.id_ocacion = oc.id_ocacion
    LEFT JOIN generos g
      ON pf.id_genero = g.id_genero
    LEFT JOIN colores co
      ON pf.id_color = co.id_color
    WHERE po.Id_usuario = ?
    ORDER BY pr.fecha DESC
  `;

  db.query(consulta, [id_usuario])
    .then(([propuestas]) => {
      res.json(propuestas);
    })
    .catch((error) => {
      console.error(error);
      res.status(500).json({
        mensaje: "Error al obtener las propuestas recibidas",
      });
    });
});

router.get("/:id", (req, res) => {
  const id_usuario = req.user.id;
  const { id } = req.params;

  const consulta = `
    SELECT
      pr.id_propuesta,
      pr.fecha,
      pr.mensaje,
      ep.estado_propuesta,
      u.nombre AS usuario,
      po.Id_usuario AS id_receptor,
      po.nombre AS prenda_publicada,
      po.imagen AS imagen_publicada,
      pf.nombre AS prenda_ofrecida,
      pf.imagen AS imagen_ofrecida,
      pr.id_usuario,
      pr.publicacion_intercambio
    FROM propuestas pr
    INNER JOIN publicaciones_intercambio pi
      ON pr.publicacion_intercambio = pi.Id_publicacion_intercambio
    INNER JOIN prendas po
      ON pi.id_prenda = po.id_prenda
    INNER JOIN prendas pf
      ON pr.prenda_ofrecida = pf.id_prenda
    INNER JOIN usuarios u
      ON pr.id_usuario = u.Id_usuario
    INNER JOIN estados_propuestas ep
      ON pr.estado_propuesta = ep.Id_estado_propuesta
    WHERE pr.id_propuesta = ?
  `;

  db.query(consulta, [id])
    .then(([propuestas]) => {
      if (propuestas.length === 0) {
        return res.status(404).json({
          mensaje: "La propuesta no existe",
        });
      }

      const propuesta = propuestas[0];

      if (Number(propuesta.id_receptor) !== Number(id_usuario)) {
        return res.status(403).json({
          mensaje: "No tenés permiso para ver esta propuesta",
        });
      }

      res.json(propuesta);
    })
    .catch((error) => {
      console.error(error);
      res.status(500).json({
        mensaje: "Error al obtener el detalle de la propuesta",
      });
    });
});

router.post("/", (req, res) => {
  const id_usuario = req.user.id;
  const { publicacion_intercambio, prenda_ofrecida, mensaje } = req.body;

  if (!publicacion_intercambio || !prenda_ofrecida) {
    return res.status(400).json({
      mensaje: "Faltan datos para enviar la propuesta",
    });
  }

  let publicacion;
  let prenda;
  let estadoPendiente;

  const consultaPublicacion = `
    SELECT
      pi.Id_publicacion_intercambio,
      pi.estado_MA,
      pi.talle_buscado,
      p.Id_usuario,
      p.privacidad
    FROM publicaciones_intercambio pi
    INNER JOIN prendas p ON pi.id_prenda = p.id_prenda
    WHERE pi.Id_publicacion_intercambio = ?
  `;

  db.query(consultaPublicacion, [publicacion_intercambio])
    .then(([publicaciones]) => {
      if (publicaciones.length === 0) {
        return res.status(404).json({
          mensaje: "La publicación no existe",
        });
      }

      publicacion = publicaciones[0];

      if (Number(publicacion.Id_usuario) === Number(id_usuario)) {
        return res.status(400).json({
          mensaje: "No podés proponer un intercambio en tu propia publicación",
        });
      }

      if (Number(publicacion.privacidad) !== 1) {
        return res.status(409).json({
          mensaje: "La publicación no está disponible",
        });
      }

      return db.query("SELECT * FROM prendas WHERE id_prenda = ?", [
        prenda_ofrecida,
      ]);
    })
    .then((resultado) => {
      if (res.headersSent) return;

      const [prendas] = resultado;

      if (prendas.length === 0) {
        return res.status(404).json({
          mensaje: "La prenda ofrecida no existe",
        });
      }

      prenda = prendas[0];

      if (Number(prenda.Id_usuario) !== Number(id_usuario)) {
        return res.status(403).json({
          mensaje: "La prenda ofrecida no te pertenece",
        });
      }

      if (Number(prenda.privacidad) !== 1) {
        return res.status(409).json({
          mensaje: "La prenda ofrecida no está disponible",
        });
      }

      const consulta = `
        SELECT pr.id_propuesta
        FROM propuestas pr
        INNER JOIN estados_propuestas ep
          ON pr.estado_propuesta = ep.Id_estado_propuesta
        WHERE pr.prenda_ofrecida = ?
        AND ep.estado_propuesta IN ('Pendiente', 'Confirmado')
      `;

      return db.query(consulta, [prenda_ofrecida]);
    })
    .then((resultado) => {
      if (res.headersSent) return;

      const [existentes] = resultado;

      if (existentes.length > 0) {
        return res.status(409).json({
          mensaje:
            "Esta prenda ya está incluida en otra propuesta pendiente o confirmada",
        });
      }

      if (
        Number(prenda.id_talla) !== Number(publicacion.talle_buscado) ||
        (publicacion.estado_MA !== null &&
          Number(prenda.id_estado_prenda) > Number(publicacion.estado_MA))
      ) {
        return res.status(409).json({
          mensaje: "La prenda no cumple con el talle o estado solicitado",
        });
      }

      const consulta = `
        SELECT *
        FROM categorias_aceptadas
        WHERE id_publicacion_intercambio = ?
        AND id_categoria = ?
      `;

      return db.query(consulta, [publicacion_intercambio, prenda.id_categoria]);
    })
    .then((resultado) => {
      if (res.headersSent) return;

      const [categorias] = resultado;

      if (categorias.length === 0) {
        return res.status(409).json({
          mensaje: "La categoría de la prenda no está aceptada",
        });
      }

      const consulta = `
        SELECT Id_estado_propuesta
        FROM estados_propuestas
        WHERE estado_propuesta = 'Pendiente'
      `;

      return db.query(consulta);
    })
    .then((resultado) => {
      if (res.headersSent) return;

      const [estados] = resultado;

      if (estados.length === 0) {
        return res.status(500).json({
          mensaje: "No se encontró el estado pendiente",
        });
      }

      estadoPendiente = estados[0].Id_estado_propuesta;

      const consulta = `
        SELECT pr.id_propuesta
        FROM propuestas pr
        INNER JOIN estados_propuestas ep
          ON pr.estado_propuesta = ep.Id_estado_propuesta
        WHERE pr.id_usuario = ?
        AND pr.publicacion_intercambio = ?
        AND ep.estado_propuesta = 'Pendiente'
      `;

      return db.query(consulta, [id_usuario, publicacion_intercambio]);
    })
    .then((resultado) => {
      if (res.headersSent) return;

      const [existentes] = resultado;

      if (existentes.length > 0) {
        return res.status(409).json({
          mensaje: "Ya tenés una propuesta pendiente para esta publicación",
        });
      }

      const consulta = `
        INSERT INTO propuestas
        (id_usuario, fecha, mensaje, estado_propuesta,
        publicacion_intercambio, prenda_ofrecida)
        VALUES (?, NOW(), ?, ?, ?, ?)
      `;

      return db.query(consulta, [
        id_usuario,
        mensaje || "",
        estadoPendiente,
        publicacion_intercambio,
        prenda_ofrecida,
      ]);
    })
    .then((resultado) => {
      if (res.headersSent) return;

      const consulta = `
        INSERT INTO \`notificaciónes\`
        (Id_usuario, Id_usuario_origen, mensaje, fecha, visto)
        VALUES (?, ?, ?, UTC_TIMESTAMP(), 0)
      `;

      return db.query(consulta, [
        publicacion.Id_usuario,
        id_usuario,
        "Recibiste una nueva propuesta de intercambio",
      ]);
    })
    .then(() => {
      if (res.headersSent) return;

      res.status(201).json({
        mensaje: "Propuesta enviada correctamente",
      });
    })
    .catch((error) => {
      console.error(error);
      res.status(500).json({
        mensaje: "Error al enviar la propuesta",
      });
    });
});

router.patch("/:id/estado", (req, res) => {
  const id_usuario = req.user.id;
  const { id } = req.params;
  const { decision } = req.body;

  let propuesta;
  let nuevoEstado;
  let mensaje;

  switch (decision) {
    case "aceptar":
      nuevoEstado = "Confirmado";
      mensaje =
        "¡Tu propuesta de intercambio fue aceptada! Ahora podés comunicarte por WhatsApp para coordinar el intercambio.";
      break;

    case "rechazar":
      nuevoEstado = "Rechazado";
      mensaje = "Tu propuesta de intercambio fue rechazada.";
      break;

    default:
      return res.status(400).json({
        mensaje: "La decisión debe ser aceptar o rechazar",
      });
  }

  const consultaPropuesta = `
    SELECT
      pr.id_propuesta,
      pr.id_usuario,
      pr.publicacion_intercambio,
      pr.estado_propuesta,
      po.Id_usuario AS id_receptor,
      u_receptor.nombre AS nombre_receptor,
      u_receptor.\`teléfono\` AS telefono_receptor
    FROM propuestas pr
    INNER JOIN publicaciones_intercambio pi
      ON pr.publicacion_intercambio = pi.Id_publicacion_intercambio
    INNER JOIN prendas po
      ON pi.id_prenda = po.id_prenda
    INNER JOIN usuarios u_receptor
      ON po.Id_usuario = u_receptor.Id_usuario
    WHERE pr.id_propuesta = ?
  `;

  db.query(consultaPropuesta, [id])
    .then(([propuestas]) => {
      if (propuestas.length === 0) {
        return res.status(404).json({
          mensaje: "La propuesta no existe",
        });
      }

      propuesta = propuestas[0];

      if (Number(propuesta.id_receptor) !== Number(id_usuario)) {
        return res.status(403).json({
          mensaje: "No tenés permiso para responder esta propuesta",
        });
      }

      const consulta = `
        SELECT Id_estado_propuesta
        FROM estados_propuestas
        WHERE estado_propuesta = 'Pendiente'
      `;

      return db.query(consulta);
    })
    .then((resultado) => {
      if (res.headersSent) return;

      const [pendientes] = resultado;

      if (
        pendientes.length === 0 ||
        Number(propuesta.estado_propuesta) !==
          Number(pendientes[0].Id_estado_propuesta)
      ) {
        return res.status(409).json({
          mensaje: "La propuesta ya fue respondida",
        });
      }

      const consulta = `
        SELECT Id_estado_propuesta
        FROM estados_propuestas
        WHERE estado_propuesta = ?
      `;

      return db.query(consulta, [nuevoEstado]);
    })
    .then((resultado) => {
      if (res.headersSent) return;

      const [estados] = resultado;

      if (estados.length === 0) {
        return res.status(500).json({
          mensaje: "No se encontró el estado solicitado",
        });
      }

      const consulta = `
        UPDATE propuestas
        SET estado_propuesta = ?
        WHERE id_propuesta = ?
      `;

      return db.query(consulta, [estados[0].Id_estado_propuesta, id]);
    })
    .then(() => {
      if (res.headersSent) return;

      const consulta = `
        INSERT INTO \`notificaciónes\`
        (Id_usuario, Id_usuario_origen, mensaje, fecha, visto)
        VALUES (?, ?, ?, UTC_TIMESTAMP(), 0)
      `;

      return db.query(consulta, [propuesta.id_usuario, id_usuario, mensaje]);
    })
    .then(() => {
      if (res.headersSent) return;

      res.json({
        mensaje:
          decision === "aceptar"
            ? "Propuesta aceptada correctamente"
            : "Propuesta rechazada correctamente",
        decision,
        telefono: decision === "aceptar" ? propuesta.telefono_receptor : null,
        nombre: decision === "aceptar" ? propuesta.nombre_receptor : null,
        id_propuesta: propuesta.id_propuesta,
      });
    })
    .catch((error) => {
      console.error(error);
      res.status(500).json({
        mensaje: "Error al responder la propuesta",
      });
    });
});

module.exports = router;
