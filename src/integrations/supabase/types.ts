export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      customer_addresses: {
        Row: {
          city: string
          complement: string | null
          created_at: string
          customer_id: string
          id: string
          is_default: boolean
          label: string
          neighborhood: string
          number: string
          postal_code: string
          recipient_name: string
          recipient_phone: string | null
          state: string
          street: string
          updated_at: string
        }
        Insert: {
          city: string
          complement?: string | null
          created_at?: string
          customer_id: string
          id?: string
          is_default?: boolean
          label?: string
          neighborhood: string
          number: string
          postal_code: string
          recipient_name: string
          recipient_phone?: string | null
          state: string
          street: string
          updated_at?: string
        }
        Update: {
          city?: string
          complement?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          is_default?: boolean
          label?: string
          neighborhood?: string
          number?: string
          postal_code?: string
          recipient_name?: string
          recipient_phone?: string | null
          state?: string
          street?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fulfillment_jobs: {
        Row: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          id: string
          idempotency_key: string
          job_type: string
          last_error: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          order_id: string | null
          payload: Json
          run_after: string
          shipment_id: string | null
          status: Database["public"]["Enums"]["fulfillment_job_status"]
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          job_type: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          order_id?: string | null
          payload?: Json
          run_after?: string
          shipment_id?: string | null
          status?: Database["public"]["Enums"]["fulfillment_job_status"]
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          job_type?: string
          last_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          order_id?: string | null
          payload?: Json
          run_after?: string
          shipment_id?: string | null
          status?: Database["public"]["Enums"]["fulfillment_job_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fulfillment_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_jobs_shipment_id_fkey"
            columns: ["shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_reservations: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          order_id: string
          order_item_id: string
          product_id: string
          quantity: number
          release_reason: string | null
          released_at: string | null
          status: Database["public"]["Enums"]["inventory_reservation_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          order_id: string
          order_item_id: string
          product_id: string
          quantity: number
          release_reason?: string | null
          released_at?: string | null
          status?: Database["public"]["Enums"]["inventory_reservation_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          order_id?: string
          order_item_id?: string
          product_id?: string
          quantity?: number
          release_reason?: string | null
          released_at?: string | null
          status?: Database["public"]["Enums"]["inventory_reservation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_reservations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      melhor_envio_oauth_connections: {
        Row: {
          access_expires_at: string
          access_token_secret_id: string
          connected_at: string
          connected_by: string | null
          id: string
          refresh_expires_at: string
          refresh_locked_at: string | null
          refresh_token_secret_id: string
          scope: string | null
          token_type: string
          updated_at: string
        }
        Insert: {
          access_expires_at: string
          access_token_secret_id: string
          connected_at?: string
          connected_by?: string | null
          id?: string
          refresh_expires_at: string
          refresh_locked_at?: string | null
          refresh_token_secret_id: string
          scope?: string | null
          token_type?: string
          updated_at?: string
        }
        Update: {
          access_expires_at?: string
          access_token_secret_id?: string
          connected_at?: string
          connected_by?: string | null
          id?: string
          refresh_expires_at?: string
          refresh_locked_at?: string | null
          refresh_token_secret_id?: string
          scope?: string | null
          token_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      melhor_envio_oauth_states: {
        Row: {
          consumed_at: string | null
          created_at: string
          created_by: string
          expires_at: string
          state_hash: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          created_by: string
          expires_at: string
          state_hash: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string
          state_hash?: string
        }
        Relationships: []
      }
      order_events: {
        Row: {
          actor_id: string | null
          actor_type: string
          created_at: string
          event_type: string
          id: number
          order_id: string
          payload: Json
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          event_type: string
          id?: number
          order_id: string
          payload?: Json
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          event_type?: string
          id?: number
          order_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          line_total_cents: number | null
          order_id: string
          producer_id: string
          product_id: string
          product_name: string
          product_snapshot: Json
          quantity: number
          unit_price_cents: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_total_cents?: number | null
          order_id: string
          producer_id: string
          product_id: string
          product_name: string
          product_snapshot: Json
          quantity: number
          unit_price_cents: number
        }
        Update: {
          created_at?: string
          id?: string
          line_total_cents?: number | null
          order_id?: string
          producer_id?: string
          product_id?: string
          product_name?: string
          product_snapshot?: Json
          quantity?: number
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          currency: string
          customer_id: string
          customer_snapshot: Json
          discount_amount_cents: number
          id: string
          idempotency_key: string
          inventory_expires_at: string | null
          order_number: number
          shipping_address_snapshot: Json
          shipping_amount_cents: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal_amount_cents: number
          total_amount_cents: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          customer_id: string
          customer_snapshot: Json
          discount_amount_cents?: number
          id?: string
          idempotency_key: string
          inventory_expires_at?: string | null
          order_number?: number
          shipping_address_snapshot: Json
          shipping_amount_cents?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_amount_cents?: number
          total_amount_cents?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          customer_id?: string
          customer_snapshot?: Json
          discount_amount_cents?: number
          id?: string
          idempotency_key?: string
          inventory_expires_at?: string | null
          order_number?: number
          shipping_address_snapshot?: Json
          shipping_amount_cents?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_amount_cents?: number
          total_amount_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_attempts: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          idempotency_key: string
          order_id: string
          payment_method: string | null
          provider: string
          provider_order_id: string | null
          provider_payment_id: string | null
          provider_response: Json
          status: Database["public"]["Enums"]["payment_attempt_status"]
          status_detail: string | null
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          idempotency_key: string
          order_id: string
          payment_method?: string | null
          provider?: string
          provider_order_id?: string | null
          provider_payment_id?: string | null
          provider_response?: Json
          status?: Database["public"]["Enums"]["payment_attempt_status"]
          status_detail?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          idempotency_key?: string
          order_id?: string
          payment_method?: string | null
          provider?: string
          provider_order_id?: string | null
          provider_payment_id?: string | null
          provider_response?: Json
          status?: Database["public"]["Enums"]["payment_attempt_status"]
          status_detail?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_attempts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      producer_fulfillment_profiles: {
        Row: {
          contact_email: string | null
          contact_name: string
          contact_phone: string
          created_at: string
          is_active: boolean
          origin_city: string
          origin_complement: string | null
          origin_neighborhood: string
          origin_number: string
          origin_postal_code: string
          origin_state: string
          origin_street: string
          producer_id: string
          special_instructions: string | null
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          contact_name: string
          contact_phone: string
          created_at?: string
          is_active?: boolean
          origin_city: string
          origin_complement?: string | null
          origin_neighborhood: string
          origin_number: string
          origin_postal_code: string
          origin_state: string
          origin_street: string
          producer_id: string
          special_instructions?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          contact_name?: string
          contact_phone?: string
          created_at?: string
          is_active?: boolean
          origin_city?: string
          origin_complement?: string | null
          origin_neighborhood?: string
          origin_number?: string
          origin_postal_code?: string
          origin_state?: string
          origin_street?: string
          producer_id?: string
          special_instructions?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "producer_fulfillment_profiles_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: true
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
        ]
      }
      producers: {
        Row: {
          bio: string | null
          created_at: string
          id: string
          image: string | null
          location: string | null
          name: string
          slug: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string
          id?: string
          image?: string | null
          location?: string | null
          name: string
          slug: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string
          id?: string
          image?: string | null
          location?: string | null
          name?: string
          slug?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          category: string
          checkout_status: Database["public"]["Enums"]["product_checkout_status"]
          created_at: string
          description: string | null
          height_cm: number | null
          id: string
          image: string[]
          is_new: boolean
          length_cm: number | null
          name: string
          original_price: number | null
          price: number
          producer_id: string | null
          stock_quantity: number
          updated_at: string
          weight_grams: number | null
          width_cm: number | null
        }
        Insert: {
          category: string
          checkout_status?: Database["public"]["Enums"]["product_checkout_status"]
          created_at?: string
          description?: string | null
          height_cm?: number | null
          id?: string
          image?: string[]
          is_new?: boolean
          length_cm?: number | null
          name: string
          original_price?: number | null
          price: number
          producer_id?: string | null
          stock_quantity?: number
          updated_at?: string
          weight_grams?: number | null
          width_cm?: number | null
        }
        Update: {
          category?: string
          checkout_status?: Database["public"]["Enums"]["product_checkout_status"]
          created_at?: string
          description?: string | null
          height_cm?: number | null
          id?: string
          image?: string[]
          is_new?: boolean
          length_cm?: number | null
          name?: string
          original_price?: number | null
          price?: number
          producer_id?: string | null
          stock_quantity?: number
          updated_at?: string
          weight_grams?: number | null
          width_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      refunds: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          idempotency_key: string
          order_id: string
          payment_attempt_id: string
          provider_refund_id: string | null
          provider_response: Json
          reason: string | null
          status: Database["public"]["Enums"]["refund_status"]
          updated_at: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          idempotency_key: string
          order_id: string
          payment_attempt_id: string
          provider_refund_id?: string | null
          provider_response?: Json
          reason?: string | null
          status?: Database["public"]["Enums"]["refund_status"]
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          idempotency_key?: string
          order_id?: string
          payment_attempt_id?: string
          provider_refund_id?: string | null
          provider_response?: Json
          reason?: string | null
          status?: Database["public"]["Enums"]["refund_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_attempt_id_fkey"
            columns: ["payment_attempt_id"]
            isOneToOne: false
            referencedRelation: "payment_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      shipments: {
        Row: {
          carrier: string | null
          created_at: string
          delivered_at: string | null
          destination_address_snapshot: Json
          external_shipment_id: string | null
          id: string
          label_error: string | null
          label_url: string | null
          order_id: string
          origin_address_snapshot: Json
          package_snapshot: Json
          producer_id: string
          provider_metadata: Json
          quote_session_id: string | null
          quoted_at: string | null
          service_id: number | null
          service_name: string | null
          shipped_at: string | null
          shipping_amount_cents: number
          status: Database["public"]["Enums"]["shipment_status"]
          tracking_code: string | null
          updated_at: string
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          destination_address_snapshot: Json
          external_shipment_id?: string | null
          id?: string
          label_error?: string | null
          label_url?: string | null
          order_id: string
          origin_address_snapshot: Json
          package_snapshot?: Json
          producer_id: string
          provider_metadata?: Json
          quote_session_id?: string | null
          quoted_at?: string | null
          service_id?: number | null
          service_name?: string | null
          shipped_at?: string | null
          shipping_amount_cents?: number
          status?: Database["public"]["Enums"]["shipment_status"]
          tracking_code?: string | null
          updated_at?: string
        }
        Update: {
          carrier?: string | null
          created_at?: string
          delivered_at?: string | null
          destination_address_snapshot?: Json
          external_shipment_id?: string | null
          id?: string
          label_error?: string | null
          label_url?: string | null
          order_id?: string
          origin_address_snapshot?: Json
          package_snapshot?: Json
          producer_id?: string
          provider_metadata?: Json
          quote_session_id?: string | null
          quoted_at?: string | null
          service_id?: number | null
          service_name?: string | null
          shipped_at?: string | null
          shipping_amount_cents?: number
          status?: Database["public"]["Enums"]["shipment_status"]
          tracking_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_quote_session_id_fkey"
            columns: ["quote_session_id"]
            isOneToOne: false
            referencedRelation: "shipping_quote_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_quote_sessions: {
        Row: {
          cart_fingerprint: string
          cart_snapshot: Json
          created_at: string
          customer_id: string
          destination_postal_code: string
          expires_at: string
          id: string
          quotes_snapshot: Json
        }
        Insert: {
          cart_fingerprint: string
          cart_snapshot: Json
          created_at?: string
          customer_id: string
          destination_postal_code: string
          expires_at: string
          id?: string
          quotes_snapshot: Json
        }
        Update: {
          cart_fingerprint?: string
          cart_snapshot?: Json
          created_at?: string
          customer_id?: string
          destination_postal_code?: string
          expires_at?: string
          id?: string
          quotes_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "shipping_quote_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          event_type: string
          external_event_id: string
          id: string
          last_error: string | null
          payload: Json
          processed_at: string | null
          processing_attempts: number
          provider: string
          received_at: string
          signature_valid: boolean
          status: Database["public"]["Enums"]["webhook_event_status"]
        }
        Insert: {
          event_type: string
          external_event_id: string
          id?: string
          last_error?: string | null
          payload: Json
          processed_at?: string | null
          processing_attempts?: number
          provider: string
          received_at?: string
          signature_valid?: boolean
          status?: Database["public"]["Enums"]["webhook_event_status"]
        }
        Update: {
          event_type?: string
          external_event_id?: string
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          processing_attempts?: number
          provider?: string
          received_at?: string
          signature_valid?: boolean
          status?: Database["public"]["Enums"]["webhook_event_status"]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_catalog_object: {
        Args: { object_name: string }
        Returns: boolean
      }
      can_manage_producer: {
        Args: { target_producer_id: string }
        Returns: boolean
      }
      claim_melhor_envio_token_refresh: { Args: never; Returns: boolean }
      consume_melhor_envio_oauth_state: {
        Args: { request_state_hash: string }
        Returns: string
      }
      create_order_with_inventory: {
        Args: {
          cart_items: Json
          customer_data: Json
          customer_profile_id: string
          discount_cents?: number
          request_idempotency_key: string
          reservation_expires_at?: string
          shipping_address_data: Json
          shipping_cost_cents?: number
        }
        Returns: string
      }
      delete_expired_shipping_quotes: { Args: never; Returns: number }
      expire_inventory_reservations: { Args: never; Returns: number }
      get_melhor_envio_oauth_tokens: {
        Args: never
        Returns: {
          access_expires_at: string
          access_token: string
          refresh_expires_at: string
          refresh_token: string
          scope: string
          token_type: string
        }[]
      }
      has_role: {
        Args: { required_role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      release_melhor_envio_token_refresh: { Args: never; Returns: undefined }
      reserve_order_inventory: {
        Args: { reservation_expires_at?: string; target_order_id: string }
        Returns: {
          expires_at: string
          product_id: string
          reserved_quantity: number
        }[]
      }
      store_melhor_envio_oauth_tokens: {
        Args: {
          access_expires_at: string
          access_token: string
          connected_by?: string
          granted_scope?: string
          refresh_expires_at: string
          refresh_token: string
          token_type?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "super_admin" | "producer"
      fulfillment_job_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
        | "cancelled"
      inventory_reservation_status:
        | "active"
        | "converted"
        | "released"
        | "expired"
      order_status:
        | "draft"
        | "awaiting_payment"
        | "paid"
        | "payment_failed"
        | "expired"
        | "cancelled"
        | "refunded"
      payment_attempt_status:
        | "created"
        | "pending"
        | "approved"
        | "rejected"
        | "cancelled"
        | "refunded"
        | "error"
      product_checkout_status: "draft" | "available" | "paused"
      refund_status: "pending" | "approved" | "rejected" | "error"
      shipment_status:
        | "pending"
        | "quoted"
        | "label_pending"
        | "label_error"
        | "label_created"
        | "shipped"
        | "delivered"
        | "cancelled"
      webhook_event_status:
        | "received"
        | "processing"
        | "processed"
        | "failed"
        | "ignored"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["super_admin", "producer"],
      fulfillment_job_status: [
        "pending",
        "processing",
        "completed",
        "failed",
        "cancelled",
      ],
      inventory_reservation_status: [
        "active",
        "converted",
        "released",
        "expired",
      ],
      order_status: [
        "draft",
        "awaiting_payment",
        "paid",
        "payment_failed",
        "expired",
        "cancelled",
        "refunded",
      ],
      payment_attempt_status: [
        "created",
        "pending",
        "approved",
        "rejected",
        "cancelled",
        "refunded",
        "error",
      ],
      product_checkout_status: ["draft", "available", "paused"],
      refund_status: ["pending", "approved", "rejected", "error"],
      shipment_status: [
        "pending",
        "quoted",
        "label_pending",
        "label_error",
        "label_created",
        "shipped",
        "delivered",
        "cancelled",
      ],
      webhook_event_status: [
        "received",
        "processing",
        "processed",
        "failed",
        "ignored",
      ],
    },
  },
} as const
