-- ============================================
-- Migración 008: Índices
-- ============================================

CREATE INDEX idx_perfil_roles_perfil ON perfil_roles(perfil_id);
CREATE INDEX idx_perfil_disciplinas_perfil ON perfil_disciplinas(perfil_id);
CREATE INDEX idx_productos_categoria ON productos(categoria_id) WHERE activo = TRUE;
CREATE INDEX idx_productos_slug ON productos(slug);
CREATE INDEX idx_pedidos_perfil ON pedidos(perfil_id);
CREATE INDEX idx_pedidos_estado ON pedidos(estado);
CREATE INDEX idx_pedidos_fecha ON pedidos(created_at DESC);
CREATE INDEX idx_eventos_fecha ON eventos(fecha_inicio) WHERE estado = 'publicado';
CREATE INDEX idx_eventos_slug ON eventos(slug);
CREATE INDEX idx_entradas_codigo ON entradas(codigo);
CREATE INDEX idx_entradas_evento ON entradas(evento_id);
CREATE INDEX idx_entradas_perfil ON entradas(perfil_id);
CREATE INDEX idx_stock_movimientos_producto ON stock_movimientos(producto_id);
CREATE INDEX idx_compras_proveedor ON compras_proveedor(proveedor_id);
CREATE INDEX idx_pagos_proveedor ON pagos_proveedor(proveedor_id);
CREATE INDEX idx_pagos_socios_perfil ON pagos_socios(perfil_id);
CREATE INDEX idx_lotes_entrada_tipo ON lotes_entrada(tipo_entrada_id);
