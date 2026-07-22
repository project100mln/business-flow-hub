export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_operator: {
        Row: {
          company_id: string
          connection_status: string
          created_at: string
          daily_call_limit: number | null
          id: string
          name: string
          phone_line: string | null
          script: string | null
          updated_at: string
          updated_by: string | null
          voice: string | null
          work_hours: string | null
        }
        Insert: {
          company_id: string
          connection_status?: string
          created_at?: string
          daily_call_limit?: number | null
          id?: string
          name?: string
          phone_line?: string | null
          script?: string | null
          updated_at?: string
          updated_by?: string | null
          voice?: string | null
          work_hours?: string | null
        }
        Update: {
          company_id?: string
          connection_status?: string
          created_at?: string
          daily_call_limit?: number | null
          id?: string
          name?: string
          phone_line?: string | null
          script?: string | null
          updated_at?: string
          updated_by?: string | null
          voice?: string | null
          work_hours?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_operator_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          company_id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          company_id: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          company_id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      call_history: {
        Row: {
          called_at: string
          comment: string | null
          company_id: string
          contact_id: string | null
          created_at: string
          id: string
          next_contact_at: string | null
          next_step: string | null
          operator_id: string | null
          recording_url: string | null
          result: Database["public"]["Enums"]["call_status"]
        }
        Insert: {
          called_at?: string
          comment?: string | null
          company_id: string
          contact_id?: string | null
          created_at?: string
          id?: string
          next_contact_at?: string | null
          next_step?: string | null
          operator_id?: string | null
          recording_url?: string | null
          result: Database["public"]["Enums"]["call_status"]
        }
        Update: {
          called_at?: string
          comment?: string | null
          company_id?: string
          contact_id?: string | null
          created_at?: string
          id?: string
          next_contact_at?: string | null
          next_step?: string | null
          operator_id?: string | null
          recording_url?: string | null
          result?: Database["public"]["Enums"]["call_status"]
        }
        Relationships: [
          {
            foreignKeyName: "call_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_history_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "cold_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          called_at: string
          client_id: string | null
          company_id: string
          contact_name: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          notes: string | null
          operator_id: string | null
          phone: string
          scheduled_callback_at: string | null
          status: Database["public"]["Enums"]["call_status"]
          updated_at: string
        }
        Insert: {
          called_at?: string
          client_id?: string | null
          company_id: string
          contact_name?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          notes?: string | null
          operator_id?: string | null
          phone: string
          scheduled_callback_at?: string | null
          status?: Database["public"]["Enums"]["call_status"]
          updated_at?: string
        }
        Update: {
          called_at?: string
          client_id?: string | null
          company_id?: string
          contact_name?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          notes?: string | null
          operator_id?: string | null
          phone?: string
          scheduled_callback_at?: string | null
          status?: Database["public"]["Enums"]["call_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calls_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calls_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          assigned_to: string | null
          company_id: string
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          notes: string | null
          phone: string
          source: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          assigned_to?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          notes?: string | null
          phone: string
          source?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          assigned_to?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          phone?: string
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cold_contacts: {
        Row: {
          added_by: string | null
          assigned_operator: string | null
          client_id: string | null
          comment: string | null
          company_id: string
          contact_type: Database["public"]["Enums"]["contact_type"]
          created_at: string
          full_name: string
          id: string
          next_contact_at: string | null
          phone: string
          source: string | null
          status: Database["public"]["Enums"]["call_status"]
          updated_at: string
        }
        Insert: {
          added_by?: string | null
          assigned_operator?: string | null
          client_id?: string | null
          comment?: string | null
          company_id: string
          contact_type?: Database["public"]["Enums"]["contact_type"]
          created_at?: string
          full_name: string
          id?: string
          next_contact_at?: string | null
          phone: string
          source?: string | null
          status?: Database["public"]["Enums"]["call_status"]
          updated_at?: string
        }
        Update: {
          added_by?: string | null
          assigned_operator?: string | null
          client_id?: string | null
          comment?: string | null
          company_id?: string
          contact_type?: Database["public"]["Enums"]["contact_type"]
          created_at?: string
          full_name?: string
          id?: string
          next_contact_at?: string | null
          phone?: string
          source?: string | null
          status?: Database["public"]["Enums"]["call_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cold_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cold_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          enabled_modules: Json
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled_modules?: Json
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled_modules?: Json
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_invites: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          email: string | null
          expires_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          token: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          expires_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          expires_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_invites_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          amount: number
          client_id: string | null
          closed_at: string | null
          company_id: string
          created_at: string
          id: string
          notes: string | null
          owner_id: string | null
          paid_amount: number
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          product_id: string | null
          stage: Database["public"]["Enums"]["deal_stage"]
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number
          client_id?: string | null
          closed_at?: string | null
          company_id: string
          created_at?: string
          id?: string
          notes?: string | null
          owner_id?: string | null
          paid_amount?: number
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          product_id?: string | null
          stage?: Database["public"]["Enums"]["deal_stage"]
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number
          client_id?: string | null
          closed_at?: string | null
          company_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          owner_id?: string | null
          paid_amount?: number
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          product_id?: string | null
          stage?: Database["public"]["Enums"]["deal_stage"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      hyla_leads: {
        Row: {
          air_quality_interest: boolean | null
          city: string | null
          comment: string | null
          company_id: string
          created_at: string
          created_by: string | null
          district: string | null
          full_name: string
          has_allergy: boolean | null
          has_carpets: boolean | null
          has_children: boolean | null
          has_mattresses: boolean | null
          has_odors: boolean | null
          has_pets: boolean | null
          id: string
          next_contact_at: string | null
          operator_id: string | null
          phone: string
          quiz_completed_at: string | null
          score: number | null
          source: string
          status: Database["public"]["Enums"]["hyla_lead_status"]
          updated_at: string
          utm_campaign: string | null
          utm_source: string | null
        }
        Insert: {
          air_quality_interest?: boolean | null
          city?: string | null
          comment?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          district?: string | null
          full_name: string
          has_allergy?: boolean | null
          has_carpets?: boolean | null
          has_children?: boolean | null
          has_mattresses?: boolean | null
          has_odors?: boolean | null
          has_pets?: boolean | null
          id?: string
          next_contact_at?: string | null
          operator_id?: string | null
          phone: string
          quiz_completed_at?: string | null
          score?: number | null
          source?: string
          status?: Database["public"]["Enums"]["hyla_lead_status"]
          updated_at?: string
          utm_campaign?: string | null
          utm_source?: string | null
        }
        Update: {
          air_quality_interest?: boolean | null
          city?: string | null
          comment?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          district?: string | null
          full_name?: string
          has_allergy?: boolean | null
          has_carpets?: boolean | null
          has_children?: boolean | null
          has_mattresses?: boolean | null
          has_odors?: boolean | null
          has_pets?: boolean | null
          id?: string
          next_contact_at?: string | null
          operator_id?: string | null
          phone?: string
          quiz_completed_at?: string | null
          score?: number | null
          source?: string
          status?: Database["public"]["Enums"]["hyla_lead_status"]
          updated_at?: string
          utm_campaign?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hyla_leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      install_requests: {
        Row: {
          address: string | null
          client_id: string | null
          client_name: string
          company_id: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          desired_at: string | null
          district: string | null
          equipment_type: string | null
          geo_lat: number | null
          geo_lng: number | null
          id: string
          master_id: string | null
          master_response: Database["public"]["Enums"]["master_response"]
          master_response_at: string | null
          operator_comment: string | null
          phone: string
          sent_to_master_at: string | null
          status: Database["public"]["Enums"]["install_request_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          client_id?: string | null
          client_name: string
          company_id: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          desired_at?: string | null
          district?: string | null
          equipment_type?: string | null
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string
          master_id?: string | null
          master_response?: Database["public"]["Enums"]["master_response"]
          master_response_at?: string | null
          operator_comment?: string | null
          phone: string
          sent_to_master_at?: string | null
          status?: Database["public"]["Enums"]["install_request_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          client_id?: string | null
          client_name?: string
          company_id?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          desired_at?: string | null
          district?: string | null
          equipment_type?: string | null
          geo_lat?: number | null
          geo_lng?: number | null
          id?: string
          master_id?: string | null
          master_response?: Database["public"]["Enums"]["master_response"]
          master_response_at?: string | null
          operator_comment?: string | null
          phone?: string
          sent_to_master_at?: string | null
          status?: Database["public"]["Enums"]["install_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "install_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "install_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "install_requests_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "cold_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      installations: {
        Row: {
          address: string | null
          client_id: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          id: string
          notes: string | null
          product_id: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["install_status"]
          technician_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          client_id?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          product_id?: string | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["install_status"]
          technician_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          client_id?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          product_id?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["install_status"]
          technician_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "installations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      installment_payments: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          due_date: string
          id: string
          installment_id: string
          paid_at: string | null
          status: string
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string
          due_date: string
          id?: string
          installment_id: string
          paid_at?: string | null
          status?: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          due_date?: string
          id?: string
          installment_id?: string
          paid_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "installment_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installment_payments_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "installments"
            referencedColumns: ["id"]
          },
        ]
      }
      installments: {
        Row: {
          client_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          deal_id: string | null
          down_payment: number
          id: string
          monthly_payment: number
          months: number
          notes: string | null
          start_date: string
          status: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          down_payment?: number
          id?: string
          monthly_payment?: number
          months?: number
          notes?: string | null
          start_date?: string
          status?: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          down_payment?: number
          id?: string
          monthly_payment?: number
          months?: number
          notes?: string | null
          start_date?: string
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "installments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installments_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          company_id: string
          created_at: string
          id: string
          read_at: string | null
          related_task_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          company_id: string
          created_at?: string
          id?: string
          read_at?: string | null
          related_task_id?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string | null
          company_id?: string
          created_at?: string
          id?: string
          read_at?: string | null
          related_task_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_task_id_fkey"
            columns: ["related_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      objects: {
        Row: {
          address: string | null
          assigned_to: string | null
          bin: string | null
          company_id: string
          company_name: string | null
          contact_person: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          assigned_to?: string | null
          bin?: string | null
          company_id: string
          company_name?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          assigned_to?: string | null
          bin?: string | null
          company_id?: string
          company_name?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "objects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          company_id: string
          cost: number
          created_at: string
          description: string | null
          id: string
          name: string
          price: number
          sku: string | null
          stock: number
          type: Database["public"]["Enums"]["product_type"]
          updated_at: string
        }
        Insert: {
          company_id: string
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          name: string
          price?: number
          sku?: string | null
          stock?: number
          type: Database["public"]["Enums"]["product_type"]
          updated_at?: string
        }
        Update: {
          company_id?: string
          cost?: number
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price?: number
          sku?: string | null
          stock?: number
          type?: Database["public"]["Enums"]["product_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_id: string | null
          created_at: string
          full_name: string | null
          id: string
          is_platform_admin: boolean
          phone: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          is_platform_admin?: boolean
          phone?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_platform_admin?: boolean
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      service_requests: {
        Row: {
          assignee_id: string | null
          client_id: string | null
          company_id: string
          completed_at: string | null
          cost: number | null
          created_at: string
          created_by: string | null
          id: string
          issue: string
          notes: string | null
          object_id: string | null
          priority: string
          product_id: string | null
          scheduled_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          client_id?: string | null
          company_id: string
          completed_at?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          issue: string
          notes?: string | null
          object_id?: string | null
          priority?: string
          product_id?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          client_id?: string | null
          company_id?: string
          completed_at?: string | null
          cost?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          issue?: string
          notes?: string | null
          object_id?: string | null
          priority?: string
          product_id?: string | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_object_id_fkey"
            columns: ["object_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          client_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          id: string
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          client_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          client_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          category: string | null
          company_id: string
          created_at: string
          created_by: string | null
          deal_id: string | null
          description: string | null
          id: string
          occurred_at: string
          type: Database["public"]["Enums"]["tx_type"]
        }
        Insert: {
          amount: number
          category?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          description?: string | null
          id?: string
          occurred_at?: string
          type: Database["public"]["Enums"]["tx_type"]
        }
        Update: {
          amount?: number
          category?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          description?: string | null
          id?: string
          occurred_at?: string
          type?: Database["public"]["Enums"]["tx_type"]
        }
        Relationships: [
          {
            foreignKeyName: "transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_add_operator: {
        Args: { _email: string; _name: string }
        Returns: string
      }
      admin_assign_contacts: {
        Args: { _ids: string[]; _operator: string }
        Returns: number
      }
      admin_remove_operator: { Args: { _user_id: string }; Returns: undefined }
      admin_rename_operator: {
        Args: { _name: string; _user_id: string }
        Returns: undefined
      }
      call_center_operator_stats: {
        Args: never
        Returns: {
          callbacks: number
          called: number
          connected: number
          conversion: number
          full_name: string
          installs: number
          refused: number
          total_contacts: number
          user_id: string
        }[]
      }
      call_center_overview: {
        Args: never
        Returns: {
          ai_effectiveness: number
          calls_month: number
          calls_today: number
          installs: number
          operators_effectiveness: number
          total_contacts: number
          unassigned: number
        }[]
      }
      check_invite: {
        Args: { _token: string }
        Returns: {
          company_name: string
          is_valid: boolean
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      create_company: {
        Args: { _name: string; _slug: string }
        Returns: string
      }
      create_invite: {
        Args: {
          _company_id: string
          _email?: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: string
      }
      current_company_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_platform_admin: { Args: { _user_id?: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      list_operators: {
        Args: never
        Returns: {
          contacts_count: number
          full_name: string
          user_id: string
        }[]
      }
      notify_upcoming_cartridge_tasks: { Args: never; Returns: number }
      refresh_installment_statuses: { Args: never; Returns: undefined }
      set_access_pin: { Args: { _pin: string }; Returns: undefined }
      verify_access_pin: { Args: { _pin: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "admin"
        | "manager"
        | "operator"
        | "installer"
        | "finance"
        | "coordinator"
      call_status:
        | "new"
        | "callback"
        | "interested"
        | "presentation_scheduled"
        | "sold"
        | "refused"
        | "queued"
        | "connected"
        | "no_answer"
        | "install_scheduled"
        | "passed_to_coordinator"
      contact_type: "cold" | "recommendation" | "instagram" | "site" | "other"
      deal_stage:
        | "lead"
        | "presentation"
        | "negotiation"
        | "installation"
        | "won"
        | "lost"
        | "client"
        | "test_install"
        | "using"
        | "decision"
        | "dismantle"
        | "sale"
      hyla_lead_status:
        | "new"
        | "quiz_done"
        | "operator_contacted"
        | "demo_scheduled"
        | "demo_done"
        | "callback"
        | "sale"
        | "refused"
        | "thinking"
      install_request_status:
        | "new"
        | "awaiting_master"
        | "sent_to_master"
        | "accepted"
        | "rejected"
        | "completed"
        | "rescheduled"
        | "cancelled"
      install_status:
        | "scheduled"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "test"
        | "dismantled"
      master_response: "pending" | "accepted" | "rejected" | "no_response"
      payment_method: "cash" | "transfer" | "installment"
      product_type: "vacuum" | "filter" | "accessory"
      task_status: "todo" | "in_progress" | "done"
      tx_type: "income" | "expense"
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
  public: {
    Enums: {
      app_role: [
        "admin",
        "manager",
        "operator",
        "installer",
        "finance",
        "coordinator",
      ],
      call_status: [
        "new",
        "callback",
        "interested",
        "presentation_scheduled",
        "sold",
        "refused",
        "queued",
        "connected",
        "no_answer",
        "install_scheduled",
        "passed_to_coordinator",
      ],
      contact_type: ["cold", "recommendation", "instagram", "site", "other"],
      deal_stage: [
        "lead",
        "presentation",
        "negotiation",
        "installation",
        "won",
        "lost",
        "client",
        "test_install",
        "using",
        "decision",
        "dismantle",
        "sale",
      ],
      hyla_lead_status: [
        "new",
        "quiz_done",
        "operator_contacted",
        "demo_scheduled",
        "demo_done",
        "callback",
        "sale",
        "refused",
        "thinking",
      ],
      install_request_status: [
        "new",
        "awaiting_master",
        "sent_to_master",
        "accepted",
        "rejected",
        "completed",
        "rescheduled",
        "cancelled",
      ],
      install_status: [
        "scheduled",
        "in_progress",
        "completed",
        "cancelled",
        "test",
        "dismantled",
      ],
      master_response: ["pending", "accepted", "rejected", "no_response"],
      payment_method: ["cash", "transfer", "installment"],
      product_type: ["vacuum", "filter", "accessory"],
      task_status: ["todo", "in_progress", "done"],
      tx_type: ["income", "expense"],
    },
  },
} as const
