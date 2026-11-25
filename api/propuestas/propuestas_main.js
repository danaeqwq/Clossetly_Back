const router = require("express").Router();
const db = require("../../config/db");

router.get("/recibidas", async (req, res) => {
  try {
    const id_usuario = req.user.id;

    const consulta = `
      SELECT
        pr.id_propuesta,
        pr.publicacion_intercambio,
        pr.fecha,
        pr.mensaje,
        ep.estado_propuesta,
        u.nombre AS usuario,

        -- Prenda publicada para intercambio
        po.nombre AS prenda_publicada,
        po.imagen AS imagen_publicada,

        -- Prenda ofrecida
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
          INNER JOIN estilos e
            ON pe.id_estilo = e.id_estilo
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

    const [propuestas] = await db.query(consulta, [id_usuario]);

    res.json(propuestas);
  } catch (error) {
    console.error("Error al obtener propuestas:", error);

    res.status(500).json({
      mensaje: "Error al obtener las propuestas recibidas",
    });
  }
});

// OBTENER DETALLE DE PROPUESTA
router.get("/:id", async (req, res) => {
  try {
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
                pf.imagen AS imagen_ofrecida
                pr.id_usuario,
                pr.publicacion_intercambio,
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

    const [propuestas] = await db.query(consulta, [id]);

    if (propuestas.length === 0) {
      return res.status(404).json({
        mensaje: "La propuesta no existe",
      });
    }

    if (Number(propuestas[0].id_receptor) !== Number(id_usuario)) {
      return res.status(403).json({
        mensaje: "No tenés permiso para ver esta propuesta",
      });
    }

    res.json(propuestas[0]);
  } catch (error) {
    console.error("Error al obtener detalle de propuesta:", error);

    res.status(500).json({
      mensaje: "Error al obtener el detalle de la propuesta",
    });
  }
});

// ENVIAR PROPUESTA
router.post("/", async (req, res) => {
  try {
    const id_usuario = req.user.id;
    const { publicacion_intercambio, prenda_ofrecida, mensaje } = req.body;

    if (!publicacion_intercambio || !prenda_ofrecida) {
      return res.status(400).json({
        mensaje: "Faltan datos para enviar la propuesta",
      });
    }

    // Verificar que la publicación exista
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

    const [publicaciones] = await db.query(consultaPublicacion, [
      publicacion_intercambio,
    ]);

    if (publicaciones.length === 0) {
      return res.status(404).json({
        mensaje: "La publicación no existe",
      });
    }

    const publicacion = publicaciones[0];

    // Evitar propuestas en publicaciones propias
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

    // Verificar que la prenda ofrecida exista
    const consultaPrenda = `
            SELECT *
            FROM prendas
            WHERE id_prenda = ?
        `;

    const [prendas] = await db.query(consultaPrenda, [prenda_ofrecida]);

    if (prendas.length === 0) {
      return res.status(404).json({
        mensaje: "La prenda ofrecida no existe",
      });
    }

    const prenda = prendas[0];

    // Verificar que la prenda pertenezca al usuario
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

    // Verificar si la prenda ya está en una propuesta pendiente o confirmada
    const consultaPrendaExistente = `
            SELECT pr.id_propuesta
            FROM propuestas pr
            INNER JOIN estados_propuestas ep
                ON pr.estado_propuesta = ep.Id_estado_propuesta
            WHERE pr.prenda_ofrecida = ?
            AND ep.estado_propuesta IN ('Pendiente', 'Confirmado')
        `;

    const [prendasExistentes] = await db.query(consultaPrendaExistente, [
      prenda_ofrecida,
    ]);

    if (prendasExistentes.length > 0) {
      return res.status(409).json({
        mensaje:
          "Esta prenda ya está incluida en otra propuesta pendiente o confirmada",
      });
    }

    console.log("COMPROBACIÓN DE PROPUESTA:", {
      tallePrenda: prenda.id_talla,
      talleBuscado: publicacion.talle_buscado,
      estadoPrenda: prenda.id_estado_prenda,
      estadoAceptado: publicacion.estado_MA,
    });

    // Verificar talle y estado solicitado
    if (
      Number(prenda.id_talla) !== Number(publicacion.talle_buscado) ||
      (publicacion.estado_MA !== null &&
        Number(prenda.id_estado_prenda) > Number(publicacion.estado_MA))
    ) {
      return res.status(409).json({
        mensaje: "La prenda no cumple con el talle o estado solicitado",
      });
    }

    // Verificar categoría aceptada
    const consultaCategoria = `
            SELECT *
            FROM categorias_aceptadas
            WHERE id_publicacion_intercambio = ?
            AND id_categoria = ?
        `;

    const [categorias] = await db.query(consultaCategoria, [
      publicacion_intercambio,
      prenda.id_categoria,
    ]);

    if (categorias.length === 0) {
      return res.status(409).json({
        mensaje: "La categoría de la prenda no está aceptada",
      });
    }

    // Obtener estado pendiente
    const consultaEstado = `
            SELECT Id_estado_propuesta
            FROM estados_propuestas
            WHERE estado_propuesta = 'Pendiente'
        `;

    const [estados] = await db.query(consultaEstado);

    if (estados.length === 0) {
      return res.status(500).json({
        mensaje: "No se encontró el estado pendiente",
      });
    }

    // Verificar si ya existe una propuesta pendiente para esta publicación
    const consultaExistente = `
            SELECT pr.id_propuesta
            FROM propuestas pr
            INNER JOIN estados_propuestas ep
                ON pr.estado_propuesta = ep.Id_estado_propuesta
            WHERE pr.id_usuario = ?
            AND pr.publicacion_intercambio = ?
            AND ep.estado_propuesta = 'Pendiente'
        `;

    const [existentes] = await db.query(consultaExistente, [
      id_usuario,
      publicacion_intercambio,
    ]);

    if (existentes.length > 0) {
      return res.status(409).json({
        mensaje: "Ya tenés una propuesta pendiente para esta publicación",
      });
    }

    // Registrar propuesta
    const consulta = `
            INSERT INTO propuestas
            (id_usuario, fecha, mensaje, estado_propuesta,
            publicacion_intercambio, prenda_ofrecida)
            VALUES (?, NOW(), ?, ?, ?, ?)
        `;

    await db.query(consulta, [
      id_usuario,
      mensaje || "",
      estados[0].Id_estado_propuesta,
      publicacion_intercambio,
      prenda_ofrecida,
    ]);

    // Crear notificación para el dueño de la publicación
    const consultaNotificacion = `
            INSERT INTO \`notificaciónes\`
            (Id_usuario, Id_usuario_origen, mensaje, fecha, visto)
            VALUES (?, ?, ?, UTC_TIMESTAMP(), 0)
        `;

    await db.query(consultaNotificacion, [
      publicacion.Id_usuario,
      id_usuario,
      "Recibiste una nueva propuesta de intercambio",
    ]);

    res.status(201).json({
      mensaje: "Propuesta enviada correctamente",
    });
  } catch (error) {
    console.error("Error al enviar propuesta:", error);
    console.log("MENSAJE DEL BACKEND:", error.response?.data);

    res.status(500).json({
      mensaje: "Error al enviar la propuesta",
    });
  }
});

// ACEPTAR O RECHAZAR PROPUESTA
router.patch("/:id/estado", async (req, res) => {
  try {
    const id_usuario = req.user.id;
    const { id } = req.params;
    const { decision } = req.body;

    if (decision !== "aceptar" && decision !== "rechazar") {
      return res.status(400).json({
        mensaje: "La decisión debe ser aceptar o rechazar",
      });
    }

    // OBTENER DATOS DE LA PROPUESTA Y DE AMBOS USUARIOS
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

    const [propuestas] = await db.query(consultaPropuesta, [id]);

    if (propuestas.length === 0) {
      return res.status(404).json({
        mensaje: "La propuesta no existe",
      });
    }

    const propuesta = propuestas[0];

    // VERIFICAR QUE SEA EL DUEÑO DE LA PUBLICACIÓN
    if (Number(propuesta.id_receptor) !== Number(id_usuario)) {
      return res.status(403).json({
        mensaje: "No tenés permiso para responder esta propuesta",
      });
    }

    // VERIFICAR QUE SIGA PENDIENTE
    const consultaPendiente = `
      SELECT Id_estado_propuesta
      FROM estados_propuestas
      WHERE estado_propuesta = 'Pendiente'
    `;

    const [pendientes] = await db.query(consultaPendiente);

    if (
      pendientes.length === 0 ||
      Number(propuesta.estado_propuesta) !==
        Number(pendientes[0].Id_estado_propuesta)
    ) {
      return res.status(409).json({
        mensaje: "La propuesta ya fue respondida",
      });
    }

    // OBTENER NUEVO ESTADO
    const estado = decision === "aceptar" ? "Confirmado" : "Rechazado";

    const consultaEstado = `
      SELECT Id_estado_propuesta
      FROM estados_propuestas
      WHERE estado_propuesta = ?
    `;

    const [estados] = await db.query(consultaEstado, [estado]);

    if (estados.length === 0) {
      return res.status(500).json({
        mensaje: "No se encontró el estado solicitado",
      });
    }

    // ACTUALIZAR ESTADO DE LA PROPUESTA
    const consultaActualizar = `
      UPDATE propuestas
      SET estado_propuesta = ?
      WHERE id_propuesta = ?
    `;

    await db.query(consultaActualizar, [estados[0].Id_estado_propuesta, id]);

    // CREAR NOTIFICACIÓN PARA QUIEN ENVIÓ LA PROPUESTA
    const mensaje =
      decision === "aceptar"
        ? "¡Tu propuesta de intercambio fue aceptada! Ahora podés comunicarte por WhatsApp para coordinar el intercambio."
        : "Tu propuesta de intercambio fue rechazada.";

    const consultaNotificacion = `
      INSERT INTO \`notificaciónes\`
      (Id_usuario, Id_usuario_origen, mensaje, fecha, visto)
      VALUES (?, ?, ?, UTC_TIMESTAMP(), 0)
    `;

    await db.query(consultaNotificacion, [
      propuesta.id_usuario,
      id_usuario,
      mensaje,
    ]);

    // RESPUESTA
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
  } catch (error) {
    console.error("Error al responder propuesta:", error);

    res.status(500).json({
      mensaje: "Error al responder la propuesta",
    });
  }
});

module.exports = router;
