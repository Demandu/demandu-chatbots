# Historial de migraciones tal como Supabase lo tenía registrado, hasta el 6 oct 2026

**Por qué existe este archivo.** Hasta el 6 de octubre de 2026 las migraciones se
aplicaron a mano (editor SQL) o por el MCP de Supabase, nunca por el CLI. Por eso
el libro mayor de Supabase (`supabase_migrations.schema_migrations`) las tenía
apuntadas con **versiones de marca de tiempo del momento en que se aplicaron**,
mientras que los archivos del repositorio se llamaban `0001_…`, `0147_…`.

Al conectar GitHub a Supabase, la integración compara el libro mayor con la
carpeta `supabase/migrations/` y **se niega a seguir si el libro tiene versiones
que no existen como archivo** («remote migration versions not found in local
migrations directory»). Esas 196 filas eran exactamente eso. Para que la
integración pueda desplegar el motor de WhatsApp, el libro tiene que decir lo
mismo que la carpeta: por eso los archivos se renombraron a
`20260101000100_init.sql`… (una marca de tiempo sintética: 2026-01-01 más tantos
minutos como el número viejo), se apuntaron esas 144 versiones como ya
aplicadas, y **estas 196 filas se quitaron del libro**.

**No se perdió ninguna migración ni se tocó el esquema.** Lo único que cambia es
cómo está anotado en el libro mayor. Este archivo conserva lo que decía el libro
antes, con la fecha y hora real de aplicación de cada una, porque esa
información —cuándo entró cada cosa en producción— ya no está en ningún otro
sitio.

Formato: `versión (AAAAMMDDHHMMSS UTC) | nombre con el que se registró`.

```
20260814235627 | init_demandu_platform
20260814235707 | harden_functions
20260815022128 | config_catalogs_and_onboarding
20260815022157 | harden_definer_functions
20260815032106 | grant_table_privileges
20260815033922 | contact_opt_out
20260815041450 | business_hours
20260815044832 | custom_attributes
20260815053753 | integrations
20260815155651 | inbox_fields
20260815162535 | bot_channel
20260815163627 | whatsapp_channels
20260815181111 | grant_execute_auth_org_ids
20260815225104 | campaigns_templates
20260816005228 | flows_triggers_multi_number
20260816012325 | campaigns_templates_per_bot
20260817004914 | drips_tables
20260817004919 | drips_enable_cron_and_net
20260817005023 | drips_engine_functions
20260817005420 | products_catalog
20260817005517 | whatsapp_forms
20260817005642 | drips_lock_down_functions
20260817010402 | drips_retry_when_channel_missing
20260817011630 | bots_widget_settings
20260817225936 | bot_ai_and_knowledge
20260817232822 | knowledge_embeddings_and_sources
20260817233242 | plans_and_storage_quota
20260817235055 | rag_strict_isolation
20260818000739 | plans_per_message_model
20260818001257 | usage_counters_and_addons
20260818002542 | simplify_to_single_message_currency
20260818002743 | addons_quote_flag
20260818005614 | custom_plans_and_stripe_sync
20260818012143 | contactos_ficha_ampliada_y_branding
20260818031941 | atajos_del_chatbot_y_solicitud_de_agente
20260818032226 | notas_internas_del_contacto
20260818034424 | respuestas_rapidas
20260818034551 | contador_de_uso_respuestas_rapidas
20260818193132 | cerrar_funciones_internas_a_visitantes
20260818194348 | no_cobrar_mensajes_que_no_se_entregaron
20260818194559 | cerrar_is_platform_admin_a_public
20260818194621 | cerrar_consumos_a_visitantes
20260818220223 | analitica_flow_runs_y_outcome
20260818220436 | analytics_overview
20260818220552 | analytics_overview_tiempo_respuesta
20260819022628 | crm_embudo_oportunidades_tareas
20260819022748 | crm_board_y_mover_tarjeta
20260819023418 | analitica_lee_el_embudo
20260819023729 | cerrar_triggers_del_crm
20260819030212 | crm_etapa_sincroniza_conversacion
20260819032124 | reparto_automatico_de_chats
20260819032244 | rueda_con_desempate_estable
20260819032603 | org_en_horario_solo_lo_propio
20260819033346 | contador_de_no_leidos
20260820170713 | interruptor_ia
20260820200536 | por_chatbot_cuadra
20260820205705 | conversacion_sin_chatbot
20260820205853 | visitantes_distinguibles
20260821033611 | agente_escribiendo
20260821044024 | nombre_tarjeta_al_dia
20260821044832 | permisos_rol_developer
20260821044842 | permisos
20260821060125 | alta_de_cliente
20260821060158 | arreglo_conv_asignar_bot
20260822012846 | nombre_del_negocio
20260822014423 | equipo_lectura_y_cambio
20260822014939 | personas
20260822015012 | limpieza_equipo_rpc
20260822020012 | invitaciones
20260822025752 | lo_que_no_supo
20260822032739 | idioma_del_lead
20260822041333 | disparadores_sociales
20260822042104 | interes_integraciones
20260822043303 | llaves_de_api
20260822044807 | sheets_config_y_cola
20260822053958 | wa_media_cache
20260822070918 | plantillas_creadas_en_demandu
20260822155021 | suscripciones
20260823034827 | cancelacion_sin_friccion
20260823040054 | baja_y_borrado
20260823040808 | dos_contadores_mensajes_y_ia
20260823041638 | consumo_por_cliente_y_freno_ia
20260823061420 | tipo_de_cambio
20260823065423 | quitar_tipo_de_cambio
20260823142407 | ficha_de_cliente_y_alta_manual
20260823142817 | cerrar_update_de_memberships
20260823143722 | estado_de_la_plataforma
20260823145447 | equipo_de_ventas_partners_y_comisiones
20260823150700 | bitacora_de_auditoria_y_rol_coordinador
20260823150714 | auth_puede_con_coordinador
20260824105930 | cerrar_alta_libre_en_memberships
20260824110018 | acceso_de_soporte_y_coordinador_sin_caja
20260824110037 | comision_por_cliente
20260824110138 | soporte_apoyos
20260825110551 | recorrido_abandonado
20260825131514 | cache_de_flujos_de_whatsapp
20260826222440 | buscar_conocimiento_por_relevancia
20260827095523 | llamadas_de_whatsapp
20260827225320 | grupo_de_leads_en_el_contacto
20260828140733 | no_procesar_dos_veces_el_mismo_mensaje
20260828220421 | esperas_programadas
20260828231308 | tickets_de_cron
20260828232805 | el_equipo_no_es_un_cliente
20260828233830 | actividad_del_equipo
20260829012332 | salidas_de_eventos
20260831232505 | calificacion_unica_y_reparto
20260831232804 | reparto_por_etiqueta
20260831234932 | origen_de_campana
20260901001005 | noop_check
20260901031356 | calificacion_automatica
20260901035436 | metrica_de_campanas
20260901040008 | metrica_de_campanas_v2
20260901221822 | canal_instagram
20260901232420 | instagram_sin_pagina
20260902004416 | conexiones_fallidas
20260902235140 | estado_de_entrega_en_la_bandeja
20260903005018 | tienda
20260903013104 | tienda_cobros
20260903052518 | pedidos
20260903053508 | yappy_cobros_y_codigo_de_pedido
20260903153201 | yappy_confirmacion_y_ventana
20260903160631 | yappy_conciliacion_transaccion_y_anulado
20260903163229 | yappy_dominio_por_defecto_y_ambiente
20260903194421 | tienda_direcciones_previas
20260903210036 | pedido_entra_a_la_bandeja
20260903233256 | pedidos_al_embudo
20260904000609 | panel_de_ventas
20260904001700 | sin_cobrar_es_deuda
20260904002707 | lista_de_quienes_pagaron
20260904003904 | cola_de_difusiones
20260904004732 | respaldo_flujos_cerrado
20260904033433 | una_sola_cuenta_activa
20260904052042 | addon_de_la_tienda
20260904055055 | complementos_en_stripe
20260904155412 | planes_por_capacidad
20260904155438 | planes_por_capacidad_tiendas_de_antes
20260904155548 | features_de_la_sesion
20260904155557 | features_no_se_preguntan_de_otros
20260904161012 | regalos_con_fecha
20260904212521 | el_mensaje_del_cliente_no_se_pierde
20260904213738 | cerrar_puertas_abiertas
20260904223522 | los_secretos_no_se_leen_por_pertenecer
20260905035817 | la_clave_de_firma_de_calendly_no_es_de_todos
20260905040814 | cada_negocio_elige_su_agenda
20260905043011 | lo_que_estaba_en_produccion_y_no_en_el_repo
20260905043245 | agentes_de_ia
20260905163651 | el_embudo_escucha_lo_que_pasa
20260905163815 | la_tienda_cuenta_lo_que_pasa
20260905200617 | etiquetas_de_etapa
20260905200709 | etiquetas_de_etapa_relleno
20260905224444 | 0100_las_citas_viven_en_la_plataforma
20260905224738 | 0101_el_enlace_para_cancelar_es_otro
20260906030247 | 0102_la_zona_horaria_deja_de_adivinarse
20260906035645 | 0103_un_formulario_sin_sincronizar_se_puede_mandar
20260906043830 | 0104_una_cuenta_nueva_nace_funcionando
20260906045158 | 0106_el_ultimo_respaldo_de_la_zona
20260906045401 | 0105_el_resto_de_lo_que_nunca_se_escribio
20260906192022 | 0107_quien_se_queda_sin_negocio_puede_crear_uno
20260906215843 | 0108_que_conteste_lana_en_los_comentarios
20260907020342 | la_tienda_manda_el_pedido_al_mensajero
20260907183442 | el_cliente_nace_con_su_contacto
20260907183532 | el_cliente_nace_con_su_contacto_completo
20260907190853 | la_plataforma_puede_escribir_correos
20260907191036 | la_bienvenida_se_manda_sola
20260907234624 | 0113_el_texto_del_correo_se_edita_sin_publicar
20260908235822 | 0114_una_funcion_definer_no_es_una_puerta_abierta
20260909164102 | 0115_que_calendarios_se_ven
20260909165736 | 0116_recordatorio_de_cita
20260909193932 | 0117_una_difusion_no_se_manda_dos_veces
20260909195302 | 0118_a_quien_le_asignaron_el_chat_se_entera
20260911235126 | 0119_reservas_el_salon_y_sus_turnos
20260912201544 | 0121_auth_puede_sabe_de_que_cuenta_habla
20260912212426 | 0122_probar_un_flujo_no_es_una_conversacion
20260912213742 | 0120_los_secretos_tampoco_se_escriben
20260913194025 | 0123_la_plataforma_habla_el_idioma_de_quien_la_usa
20260914233627 | 0124_una_conversacion_siempre_tiene_dueno
20260915010228 | 0125_soltar_un_chat_es_devolverlo_a_la_rueda
20260916144045 | 0126_una_cita_dura_lo_que_dura_el_servicio
20260917195434 | 0127_los_recordatorios_de_cita_los_manda_alguien
20260917215445 | 0128_ningun_plan_activo_se_queda_sin_cupo
20260917233225 | 0129_las_plantillas_de_la_casa_se_aseguran_solas
20260919153053 | 0130_el_candado_llega_a_las_siete_que_faltaban
20260919173246 | la_cita_tambien_dice_de_quien_es
20260919175208 | la_cita_dice_cuando_acaba_y_de_que_es
20260919191951 | la_tienda_publica_solo_ensena_lo_publico
20260919193242 | el_escaparate_tampoco_reparte_el_org_id
20260919200240 | una_tabla_sin_politicas_tampoco_reparte_permisos
20260919201842 | un_almacen_para_lo_que_es_de_una_persona
20260919204048 | 0137_lo_que_contesta_un_lead_queda_en_su_ficha
20260921004443 | 0138_un_chatbot_no_se_presta_entre_cuentas
20261003160529 | una_plantilla_con_imagen_necesita_su_imagen
20261003183114 | 0142_cada_quien_ve_lo_suyo_y_soltar_es_soltar
20261003183453 | 0141_que_anuncio_trae_gente_que_compra
20261003203035 | 0140_un_telefono_una_persona
20261005234252 | 0143_lo_que_duele_al_escalar
20261006004957 | 0147_lo_que_de_verdad_viaja_al_crm
```

**Dos cosas que este historial deja ver y que conviene no olvidar:**

- La `0143_app_movil_reservas_y_push` de la app móvil **no aparece**: se aplicó
  en el editor SQL y el editor no apunta en el libro. Sus tablas existen
  (`dispositivos_push`, `push_cola`) pero su archivo sigue en
  `mobile app /cambios-web/`, fuera de `supabase/migrations/`.
- Hay nombres repetidos con número y sin número (`0100_…` y `las_citas…`) porque
  en septiembre se cambió la costumbre de nombrar a mitad de camino.
