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
const usuarioRouter = require("./usuarios/Mi_cuenta_main");
const preguntasRouter = require("./testEstilo/preguntas/preguntas_main");
const resultadosRouter = require("./testEstilo/resultados/resultados_main");
const propuestasRouter = require("./propuestas/propuestas_main");
const notificacionesRouter = require("./notificaciones/notificaciones_main");
const gestionUsuariosRouter = require ("./usuarios/Gestion_usuarios_main")
const ventasRouter = require ("./ventas/ventas_main")
const recuperarPassRouter = require("./auth/recuperarPass");
const adminPublicacionesRouter = require("./publicaciones/publicaciones_admin_main");

const loginRouter = require("./auth/login");
const registroRouter = require("./auth/registro");

// RUTAS PÚBLICAS
router.use("/login", loginRouter);
router.use("/registro", registroRouter);
router.use("/recuperar-pass", recuperarPassRouter);
router.use("/test-estilo/preguntas", preguntasRouter);
router.use("/test-estilo/resultados", resultadosRouter);

// RUTAS PROTEGIDAS: USUARIOS CON SESIÓN
router.use("/publicaciones/compra", middlewareSeg, compraRouter);
router.use("/publicaciones/intercambio", middlewareSeg, intercambioRouter);
router.use("/filtros", middlewareSeg, filtrosRouter);
router.use("/pedidos", middlewareSeg, pedidoRouter);
router.use("/pedido-items", middlewareSeg, pedidoItemRouter);
router.use("/prendas", middlewareSeg, prendasRouter);
router.use("/outfits", middlewareSeg, outfitsRouter);
router.use("/usuarios", middlewareSeg, usuarioRouter);
router.use("/propuestas", middlewareSeg, propuestasRouter);
router.use("/notificaciones", middlewareSeg, notificacionesRouter);
router.use("/ventas", middlewareSeg, ventasRouter);
// RUTAS DE ADMINISTRACIÓN
router.use("/admin/usuarios",middlewareSeg,middlewareRol("Admin"),gestionUsuariosRouter);
router.use("/admin/publicaciones",middlewareSeg,middlewareRol("Admin"),adminPublicacionesRouter);

module.exports = router;
