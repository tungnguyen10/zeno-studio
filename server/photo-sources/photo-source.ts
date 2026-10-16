export interface SourcePhoto {
  id: string
  filename: string
  mimeType: string
  resourceKey?: string
  thumbnailLink?: string
  width?: number
  height?: number
}

export interface FolderReference {
  folderId: string
  resourceKey?: string
}

export interface PhotoPage {
  items: SourcePhoto[]
  nextPageToken?: string
}

export interface PhotoSourceAdapter {
  listPhotos(folder: FolderReference, pageToken?: string): Promise<PhotoPage>
  readPhoto(fileId: string, resourceKey?: string): Promise<Response>
}
