export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      assessment_preps: {
        Row: {
          id: string;
          owner_id: string;
          project_id: string;
          grade_level: string;
          subject: string;
          lesson_context: string;
          evaluation_goal: string;
          achievement_standards: Json;
          safety_rules: string;
          student_guidance: string;
          notion_config: Json;
          sample_evaluation_notes: string;
          status: "draft" | "active";
          current_version: number;
          active_version_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          project_id: string;
          grade_level?: string;
          subject?: string;
          lesson_context?: string;
          evaluation_goal?: string;
          achievement_standards?: Json;
          safety_rules?: string;
          student_guidance?: string;
          notion_config?: Json;
          sample_evaluation_notes?: string;
          status?: "draft" | "active";
          current_version?: number;
          active_version_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          grade_level?: string;
          subject?: string;
          lesson_context?: string;
          evaluation_goal?: string;
          achievement_standards?: Json;
          safety_rules?: string;
          student_guidance?: string;
          notion_config?: Json;
          sample_evaluation_notes?: string;
          status?: "draft" | "active";
          current_version?: number;
          active_version_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      assessment_prep_versions: {
        Row: {
          id: string;
          prep_id: string;
          project_id: string;
          rubric_id: string | null;
          version_number: number;
          snapshot: Json;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          prep_id: string;
          project_id: string;
          rubric_id?: string | null;
          version_number: number;
          snapshot: Json;
          created_by: string;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      student_growth_records: {
        Row: {
          id: string;
          owner_id: string;
          student_key: string;
          previous_evaluation_id: string | null;
          current_evaluation_id: string;
          criterion_key: string;
          previous_score_percentage: number | null;
          current_score_percentage: number | null;
          previous_evidence: string | null;
          current_evidence: string | null;
          change_type: "improved" | "maintained" | "needs-support" | "not-observed";
          prior_evaluation_forward: string | null;
          forward_applied: boolean | null;
          teacher_confirmed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          student_key: string;
          previous_evaluation_id?: string | null;
          current_evaluation_id: string;
          criterion_key: string;
          previous_score_percentage?: number | null;
          current_score_percentage?: number | null;
          previous_evidence?: string | null;
          current_evidence?: string | null;
          change_type: "improved" | "maintained" | "needs-support" | "not-observed";
          prior_evaluation_forward?: string | null;
          forward_applied?: boolean | null;
          teacher_confirmed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          previous_score_percentage?: number | null;
          current_score_percentage?: number | null;
          previous_evidence?: string | null;
          current_evidence?: string | null;
          change_type?: "improved" | "maintained" | "needs-support" | "not-observed";
          prior_evaluation_forward?: string | null;
          forward_applied?: boolean | null;
          teacher_confirmed?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      student_term_summaries: {
        Row: {
          id: string;
          owner_id: string;
          student_key: string;
          period_label: string;
          included_evaluation_ids: string[];
          evidence: Json;
          draft_text: string;
          teacher_final_text: string;
          status: "draft" | "confirmed";
          confirmed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          student_key: string;
          period_label: string;
          included_evaluation_ids?: string[];
          evidence?: Json;
          draft_text?: string;
          teacher_final_text?: string;
          status?: "draft" | "confirmed";
          confirmed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          period_label?: string;
          included_evaluation_ids?: string[];
          evidence?: Json;
          draft_text?: string;
          teacher_final_text?: string;
          status?: "draft" | "confirmed";
          confirmed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      school_pdf_templates: {
        Row: {
          id: string; owner_id: string; school_name: string; document_type: string; school_year: string;
          file_name: string; storage_path: string; sha256: string; page_count: number; has_acroform: boolean;
          analysis_status: "pending" | "ready" | "error"; analysis_error: string | null; original_version: number;
          created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; owner_id: string; school_name: string; document_type: string; school_year: string;
          file_name: string; storage_path: string; sha256: string; page_count?: number; has_acroform?: boolean;
          analysis_status?: "pending" | "ready" | "error"; analysis_error?: string | null; original_version?: number;
          created_at?: string; updated_at?: string;
        };
        Update: {
          school_name?: string; document_type?: string; school_year?: string; file_name?: string; storage_path?: string;
          sha256?: string; page_count?: number; has_acroform?: boolean; analysis_status?: "pending" | "ready" | "error";
          analysis_error?: string | null; original_version?: number; updated_at?: string;
        };
        Relationships: [];
      };
      school_pdf_template_fields: {
        Row: {
          id: string; template_id: string; page_number: number; field_label: string; acroform_name: string | null;
          x: number | null; y: number | null; width: number | null; height: number | null; source_key: string;
          char_limit: number | null; line_limit: number | null; font_size: number; is_required: boolean;
          sort_order: number; created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; template_id: string; page_number?: number; field_label: string; acroform_name?: string | null;
          x?: number | null; y?: number | null; width?: number | null; height?: number | null; source_key?: string;
          char_limit?: number | null; line_limit?: number | null; font_size?: number; is_required?: boolean;
          sort_order?: number; created_at?: string; updated_at?: string;
        };
        Update: {
          page_number?: number; field_label?: string; acroform_name?: string | null; x?: number | null; y?: number | null;
          width?: number | null; height?: number | null; source_key?: string; char_limit?: number | null;
          line_limit?: number | null; font_size?: number; is_required?: boolean; sort_order?: number; updated_at?: string;
        };
        Relationships: [];
      };
      export_audits: {
        Row: {
          id: string; owner_id: string; template_id: string | null; summary_id: string | null;
          export_type: "pdf" | "notion"; status: "started" | "completed" | "failed";
          storage_path: string | null; metadata: Json; error_message: string | null; created_at: string; completed_at: string | null;
        };
        Insert: {
          id?: string; owner_id: string; template_id?: string | null; summary_id?: string | null;
          export_type: "pdf" | "notion"; status: "started" | "completed" | "failed";
          storage_path?: string | null; metadata?: Json; error_message?: string | null; created_at?: string; completed_at?: string | null;
        };
        Update: {
          status?: "started" | "completed" | "failed"; storage_path?: string | null; metadata?: Json;
          error_message?: string | null; completed_at?: string | null;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          role: "teacher" | "admin";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          role?: "teacher" | "admin";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          email?: string | null;
          full_name?: string | null;
          role?: "teacher" | "admin";
          updated_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          owner_id: string;
          rubric_id: string | null;
          title: string;
          description: string | null;
          source_url: string | null;
          notion_source: Json;
          status: "draft" | "active" | "archived";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          rubric_id?: string | null;
          title: string;
          description?: string | null;
          source_url?: string | null;
          notion_source?: Json;
          status?: "draft" | "active" | "archived";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          rubric_id?: string | null;
          title?: string;
          description?: string | null;
          source_url?: string | null;
          notion_source?: Json;
          status?: "draft" | "active" | "archived";
          updated_at?: string;
        };
        Relationships: [];
      };
      rubrics: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          description: string | null;
          auto_generated: boolean;
          generation_context: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          description?: string | null;
          auto_generated?: boolean;
          generation_context?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          description?: string | null;
          auto_generated?: boolean;
          generation_context?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      rubric_criteria: {
        Row: {
          id: string;
          rubric_id: string;
          label: string;
          description: string;
          max_score: number;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          rubric_id: string;
          label: string;
          description: string;
          max_score?: number;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          label?: string;
          description?: string;
          max_score?: number;
          sort_order?: number;
        };
        Relationships: [];
      };
      comments: {
        Row: {
          id: string;
          project_id: string;
          student_name: string | null;
          content: string;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          student_name?: string | null;
          content: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          student_name?: string | null;
          content?: string;
          metadata?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      evaluations: {
        Row: {
          id: string;
          project_id: string;
          comment_id: string;
          evaluator_id: string;
          assessment_prep_version_id: string | null;
          source: "teacher-manual" | "ai-draft";
          status: "draft" | "confirmed";
          confidence: number | null;
          review_reasons: string[];
          evaluation_forward: string | null;
          confirmed_at: string | null;
          revision: number;
          change_reason: string | null;
          model_name: string | null;
          total_score: number | null;
          feedback: string | null;
          raw_output: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          comment_id: string;
          evaluator_id: string;
          assessment_prep_version_id?: string | null;
          source?: "teacher-manual" | "ai-draft";
          status?: "draft" | "confirmed";
          confidence?: number | null;
          review_reasons?: string[];
          evaluation_forward?: string | null;
          confirmed_at?: string | null;
          revision?: number;
          change_reason?: string | null;
          model_name?: string | null;
          total_score?: number | null;
          feedback?: string | null;
          raw_output?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          assessment_prep_version_id?: string | null;
          source?: "teacher-manual" | "ai-draft";
          status?: "draft" | "confirmed";
          confidence?: number | null;
          review_reasons?: string[];
          evaluation_forward?: string | null;
          confirmed_at?: string | null;
          revision?: number;
          change_reason?: string | null;
          model_name?: string | null;
          total_score?: number | null;
          feedback?: string | null;
          raw_output?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      evaluation_revisions: {
        Row: {
          id: string;
          evaluation_id: string;
          project_id: string;
          comment_id: string;
          revision_number: number;
          total_score: number | null;
          feedback: string | null;
          evaluation_forward: string | null;
          review_reasons: string[];
          score_snapshot: Json;
          change_reason: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          evaluation_id: string;
          project_id: string;
          comment_id: string;
          revision_number: number;
          total_score?: number | null;
          feedback?: string | null;
          evaluation_forward?: string | null;
          review_reasons?: string[];
          score_snapshot?: Json;
          change_reason?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      evaluation_scores: {
        Row: {
          id: string;
          evaluation_id: string;
          criterion_id: string;
          score: number;
          rationale: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          evaluation_id: string;
          criterion_id: string;
          score: number;
          rationale?: string | null;
          created_at?: string;
        };
        Update: {
          score?: number;
          rationale?: string | null;
        };
        Relationships: [];
      };
      questioning_lesson_connections: {
        Row: {
          id: string;
          lesson_code: string;
          teacher_label: string | null;
          lesson_title: string | null;
          gemini_model: string;
          gemini_api_key_ciphertext: string;
          notion_api_key_ciphertext: string;
          notion_prep_database_id: string;
          notion_result_database_id: string;
          chatbot_config: Json;
          student_chatbot_path: string;
          status: "active" | "archived";
          expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lesson_code: string;
          teacher_label?: string | null;
          lesson_title?: string | null;
          gemini_model?: string;
          gemini_api_key_ciphertext: string;
          notion_api_key_ciphertext: string;
          notion_prep_database_id: string;
          notion_result_database_id: string;
          chatbot_config?: Json;
          student_chatbot_path?: string;
          status?: "active" | "archived";
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          lesson_code?: string;
          teacher_label?: string | null;
          lesson_title?: string | null;
          gemini_model?: string;
          gemini_api_key_ciphertext?: string;
          notion_api_key_ciphertext?: string;
          notion_prep_database_id?: string;
          notion_result_database_id?: string;
          chatbot_config?: Json;
          student_chatbot_path?: string;
          status?: "active" | "archived";
          expires_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      questioning_documents: {
        Row: {
          id: string;
          lesson_code: string | null;
          title: string;
          body_text: string;
          summary: string;
          target_grade: string | null;
          subject_unit: string | null;
          standard: string | null;
          teacher_memo: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lesson_code?: string | null;
          title: string;
          body_text?: string;
          summary?: string;
          target_grade?: string | null;
          subject_unit?: string | null;
          standard?: string | null;
          teacher_memo?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          lesson_code?: string | null;
          title?: string;
          body_text?: string;
          summary?: string;
          target_grade?: string | null;
          subject_unit?: string | null;
          standard?: string | null;
          teacher_memo?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      questioning_thinking_cards: {
        Row: {
          id: string;
          document_id: string;
          card_type: string;
          title: string;
          summary: string;
          content: string;
          source_type: string;
          source_text: string;
          source_location: string;
          reasoning_type: string | null;
          confidence: number;
          knowledge_status: string;
          student_level: string | null;
          difficulty: number | null;
          keywords: string[];
          related_questions: string[];
          question_intent: string | null;
          related_card_ids: string[];
          external_source_url: string | null;
          external_source_title: string | null;
          external_source_organization: string | null;
          external_source_date: string | null;
          source_reliability: string | null;
          dialogue_trigger: string | null;
          dialogue_prompt: string | null;
          dialogue_goal: string | null;
          is_enabled: boolean;
          embedding_json: Json;
          embedding_model: string | null;
          parent_card_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          card_type: string;
          title: string;
          summary?: string;
          content?: string;
          source_type: string;
          source_text?: string;
          source_location?: string;
          reasoning_type?: string | null;
          confidence?: number;
          knowledge_status?: string;
          student_level?: string | null;
          difficulty?: number | null;
          keywords?: string[];
          related_questions?: string[];
          question_intent?: string | null;
          related_card_ids?: string[];
          external_source_url?: string | null;
          external_source_title?: string | null;
          external_source_organization?: string | null;
          external_source_date?: string | null;
          source_reliability?: string | null;
          dialogue_trigger?: string | null;
          dialogue_prompt?: string | null;
          dialogue_goal?: string | null;
          is_enabled?: boolean;
          embedding_json?: Json;
          embedding_model?: string | null;
          parent_card_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          card_type?: string;
          title?: string;
          summary?: string;
          content?: string;
          source_type?: string;
          source_text?: string;
          source_location?: string;
          reasoning_type?: string | null;
          confidence?: number;
          knowledge_status?: string;
          student_level?: string | null;
          difficulty?: number | null;
          keywords?: string[];
          related_questions?: string[];
          question_intent?: string | null;
          related_card_ids?: string[];
          external_source_url?: string | null;
          external_source_title?: string | null;
          external_source_organization?: string | null;
          external_source_date?: string | null;
          source_reliability?: string | null;
          dialogue_trigger?: string | null;
          dialogue_prompt?: string | null;
          dialogue_goal?: string | null;
          is_enabled?: boolean;
          embedding_json?: Json;
          embedding_model?: string | null;
          parent_card_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      questioning_card_relations: {
        Row: {
          id: string;
          from_card_id: string;
          to_card_id: string;
          relation_type: string;
          note: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          from_card_id: string;
          to_card_id: string;
          relation_type: string;
          note?: string;
          created_at?: string;
        };
        Update: {
          relation_type?: string;
          note?: string;
        };
        Relationships: [];
      };
      questioning_student_questions: {
        Row: {
          id: string;
          document_id: string | null;
          lesson_code: string | null;
          student_key: string | null;
          raw_question: string;
          normalized_question: string;
          question_intent: string | null;
          used_card_ids: string[];
          answer_text: string;
          answer_confidence: number | null;
          answerable: boolean | null;
          missing_information: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          document_id?: string | null;
          lesson_code?: string | null;
          student_key?: string | null;
          raw_question: string;
          normalized_question?: string;
          question_intent?: string | null;
          used_card_ids?: string[];
          answer_text?: string;
          answer_confidence?: number | null;
          answerable?: boolean | null;
          missing_information?: string | null;
          created_at?: string;
        };
        Update: {
          answer_text?: string;
          answer_confidence?: number | null;
          answerable?: boolean | null;
          missing_information?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      activate_assessment_prep: {
        Args: { target_prep_id: string };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
