const router = require("express").Router();

const middlewareSeg = require("./middlewares/middlewareSeg");
const middlewareRol = require("./middlewares/middlewareRol");

const compraRouter = require("./publicaciones/publicaciones_compra_main");
const intercambioRouter = require("./publicaciones/publicaciones_intercambio_main");
const filtrosRouter = require("./filtros/filtros_main");
const pedidoRouter = require("./pedidos/pedidos_main");
const pedidoItemRouter = require("./pedidos/pedido_item_main");
const prendasRouter = require("./prendas/prendas_main");
const outfitsRouter = require("./outfits/outfits_main");
const usuarioRouter = require("./usuarios/usuarios_main");
const preguntasRouter = require("./testEstilo/preguntas/preguntas_main");
const resultadosRouter = require("./testEstilo/resultados/resultados_main");

const loginRouter = require("./auth/login");
const registroRouter = require("./auth/registro");

// RUTAS PÚBLICAS
router.use("/login", loginRouter);
router.use("/registro", registroRouter);
router.use("/publicaciones/compra", compraRouter);
router.use("/publicaciones/intercambio", intercambioRouter);

router.use("/test-estilo/preguntas", preguntasRouter);
router.use("/test-estilo/resultados", resultadosRouter);

// RUTAS PROTEGIDAS: USUARIOS CON SESIÓN
router.use("/filtros", middlewareSeg, filtrosRouter);
router.use("/pedidos", middlewareSeg, pedidoRouter);
router.use("/pedido-items", middlewareSeg, pedidoItemRouter);
router.use("/prendas", middlewareSeg, prendasRouter);
router.use("/outfits", outfitsRouter);
router.use("/usuarios", middlewareSeg, usuarioRouter);
// RUTAS DE ADMINISTRACIÓN
router.use("/admin", middlewareSeg, middlewareRol("Admin"));

module.exports = router;
