export type RelationshipLink = {
  id?: string
  pair_key?: string
  user_a: string
  user_b: string
  link_type: 'Primary' | 'Play Partner' | 'Polycule Member'
  status: 'Pending' | 'Confirmed' | 'Rejected'
  merge_visibility?: boolean
  user_a_name?: string
  user_b_name?: string
  user_a_email?: string
  user_b_email?: string
}

export type Constellation = {
  name: string
  slug: string
  city?: string
  members?: string[]
  links?: RelationshipLink[]
}
