import Koa from 'koa';
import autoBind from 'auto-bind';
import DatabaseManager from '../services/database-manager';
import { ensureLoggedIn } from './utils/auth';
import { inject } from '../di/dependency-injection';
import { AuthenticationUtils } from '../utils/authentication';
import { validateRequiredFields } from './utils/validation';
import { nextOrderStatus, provisionPrepaidCard, updateOrderStatus } from './utils/orders';
import WyreService from '../services/wyre';
import { validate as validateUUID } from 'uuid';
import * as JSONAPI from 'jsonapi-typescript';

export default class OrdersRoute {
  authenticationUtils: AuthenticationUtils = inject('authentication-utils', { as: 'authenticationUtils' });
  databaseManager: DatabaseManager = inject('database-manager', { as: 'databaseManager' });
  wyre: WyreService = inject('wyre');
  relay = inject('relay');
  subgraph = inject('subgraph');

  constructor() {
    autoBind(this);
  }
  async post(ctx: Koa.Context) {
    if (!ensureLoggedIn(ctx)) {
      return;
    }
    if (
      !validateRequiredFields(ctx, {
        requiredAttributes: ['order-id', 'wallet-id'],
        requiredRelationships: ['reservation'],
      })
    ) {
      return;
    }
    let userAddress = ctx.state.userAddress.toLowerCase();
    let orderId = ctx.request.body.data.attributes['order-id'];
    let walletId = ctx.request.body.data.attributes['wallet-id'];
    let reservationId = ctx.request.body.data.relationships.reservation.data.id;

    let validationError = await this.validateOrder(orderId, userAddress, reservationId, walletId);
    if (validationError) {
      ctx.status = 422;
      ctx.body = {
        errors: [
          {
            status: '422',
            title: 'Cannot create order',
            detail: validationError,
          },
        ],
      };
      ctx.type = 'application/vnd.api+json';
      return;
    }

    let db = await this.databaseManager.getClient();
    let status: string;
    ({ status } = await nextOrderStatus(db, 'received-reservation', orderId));
    await db.query(
      `INSERT INTO wallet_orders (
           order_id, user_address, wallet_id, reservation_id, status
         ) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (order_id)
         DO UPDATE SET
           reservation_id = $4,
           status = $5,
           updated_at = now()`,
      [orderId, userAddress.toLowerCase(), walletId, reservationId, status]
    );

    if (status === 'provisioning') {
      await provisionPrepaidCard(db, this.relay, this.subgraph, reservationId);
      ({ status } = await updateOrderStatus(db, orderId, 'provision-mined'));
    }

    ctx.status = 201;
    ctx.body = await this.makeOrderDocument(orderId, userAddress, reservationId, walletId, status);
    ctx.type = 'application/vnd.api+json';
    return;
  }

  async get(ctx: Koa.Context) {
    if (!ensureLoggedIn(ctx)) {
      return;
    }
    let userAddress = ctx.state.userAddress.toLowerCase();
    let orderId = ctx.params.order_id;
    let db = await this.databaseManager.getClient();
    let { rows } = await db.query(`SELECT * FROM wallet_orders WHERE order_id = $1`, [orderId]);
    if (rows.length === 0) {
      handleNotFound(ctx);
      return;
    }

    let [{ wallet_id: walletId, user_address: orderUserAddress, reservation_id: reservationId, status }] = rows;
    if (userAddress !== orderUserAddress) {
      handleNotFound(ctx);
      return;
    }

    ctx.status = 200;
    ctx.body = await this.makeOrderDocument(orderId, userAddress, reservationId, walletId, status);
    ctx.type = 'application/vnd.api+json';
    return;
  }

  private async validateOrder(
    orderId: string,
    userAddress: string,
    reservationId: string,
    walletId: string
  ): Promise<string | undefined> {
    // make sure that we word our error messages such that we don't leak the
    // existence of entities that the user is not entitled to access
    let db = await this.databaseManager.getClient();

    if (!validateUUID(reservationId)) {
      return `Could not locate reservation ${reservationId}`;
    }
    let { rows: reservations } = await db.query('SELECT * from reservations WHERE id = $1', [reservationId]);
    if (reservations.length === 0) {
      return `Could not locate reservation ${reservationId}`;
    }
    let [{ user_address: reservationUserAddress }] = reservations;
    if (reservationUserAddress.toLowerCase() !== userAddress.toLowerCase()) {
      return `Could not locate reservation ${reservationId}`;
    }
    let { rows: orders } = await db.query('SELECT * from wallet_orders WHERE order_id = $1', [orderId]);
    if (orders.length > 0) {
      let [{ user_address: orderUserAddress, wallet_id: orderWalletId }] = orders;
      if (orderUserAddress.toLowerCase() !== userAddress.toLowerCase()) {
        return `Could not locate order ${orderId}`;
      }
      if (walletId !== orderWalletId) {
        return `Could not locate order ${orderId}`;
      }
    }
    let wallet = await this.wyre.getWalletByUserAddress(userAddress);
    if (!wallet) {
      return `Could not locate wallet ${walletId}`;
    }
    if (wallet.id !== walletId) {
      return `Could not locate wallet ${walletId}`;
    }

    return;
  }

  private async makeOrderDocument(
    orderId: string,
    userAddress: string,
    reservationId: string | null,
    walletId: string,
    status: string
  ): Promise<JSONAPI.Document> {
    let order: JSONAPI.ResourceObject = {
      id: orderId,
      type: 'orders',
      attributes: {
        'order-id': orderId,
        'user-address': userAddress,
        'wallet-id': walletId,
        status,
      },
      relationships: {
        reservation: { data: null },
      },
    };
    if (reservationId == null) {
      return { data: order };
    }

    order.relationships = {
      reservation: { data: { id: reservationId, type: 'reservations' } },
    };
    return {
      data: order,
      included: [await this.makeReservationResource(reservationId)],
    };
  }

  private async makeReservationResource(reservationId: string): Promise<JSONAPI.ResourceObject> {
    let db = await this.databaseManager.getClient();
    let {
      rows: [{ user_address: userAddress, sku, transaction_hash: txnHash, prepaid_card_address: prepaidCardAddress }],
    } = await db.query(
      `SELECT
         id,
         user_address,
         sku,
         transaction_hash,
         prepaid_card_address
       FROM reservations
       WHERE id = $1`,
      [reservationId]
    );
    return {
      id: reservationId,
      type: 'reservations',
      attributes: {
        'user-address': userAddress,
        sku,
        'transaction-hash': txnHash,
        'prepaid-card-address': prepaidCardAddress,
      },
    };
  }
}

function handleNotFound(ctx: Koa.Context) {
  ctx.status = 404;
  ctx.body = {
    errors: [
      {
        status: '404',
        title: 'Order not found',
        detail: `Order ${ctx.params.order_id} not found`,
      },
    ],
  };
  ctx.type = 'application/vnd.api+json';
}

declare module '@cardstack/hub/di/dependency-injection' {
  interface KnownServices {
    'orders-route': OrdersRoute;
  }
}